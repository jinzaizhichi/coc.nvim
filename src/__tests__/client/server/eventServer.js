'use strict'
const {createConnection, TextEdit, RenameRequest, ProtocolRequestType, TextDocuments, Range, DiagnosticSeverity, Location, Diagnostic, DiagnosticRelatedInformation, PositionEncodingKind, WorkDoneProgress, ResponseError, LogMessageNotification, MessageType, ShowMessageNotification, ShowMessageRequest, ShowDocumentRequest, ApplyWorkspaceEditRequest, TextDocumentSyncKind, Position, RegistrationType} = require('vscode-languageserver/node')
const {TextDocument} = require('vscode-languageserver-textdocument')
let documents = new TextDocuments(TextDocument)

const connection = createConnection()
console.log = connection.console.log.bind(connection.console)
console.error = connection.console.error.bind(connection.console)
let options
documents.listen(connection)
connection.onInitialize((params) => {
  options = params.initializationOptions || {}
  if (options.throwError) {
    setTimeout(() => {
      process.exit()
    }, 10)
    return new ResponseError(1, 'message', {retry: true})
  }
  if (options.normalThrow) {
    setTimeout(() => {
      process.exit()
    }, 10)
    throw new Error('normal throw error')
  }
  if (options.utf8) {
    return {capabilities: {positionEncoding: PositionEncodingKind.UTF8}}
  }
  if (options.trace) {
    setTimeout(() => {
      connection.tracer.log('This is a trace message')
      connection.tracer.log('This is a trace message', {'info': 'verbose info'})
    }, 1)
  }
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full
    }
  }
})

connection.onNotification('diagnostics', () => {
  let diagnostics = []
  let related = []
  let uri = 'lsptest:///2'
  related.push(DiagnosticRelatedInformation.create(Location.create(uri, Range.create(0, 0, 0, 1)), 'dup'))
  related.push(DiagnosticRelatedInformation.create(Location.create(uri, Range.create(0, 0, 1, 0)), 'dup'))
  diagnostics.push(Diagnostic.create(Range.create(0, 0, 1, 0), 'msg', DiagnosticSeverity.Error, undefined, undefined, related))
  void connection.sendDiagnostics({uri: 'lsptest:///1', diagnostics})
  void connection.sendDiagnostics({uri: 'lsptest:///3', version: 1, diagnostics})
})

connection.onNotification('simpleEdit', async () => {
  let res = await connection.sendRequest(ApplyWorkspaceEditRequest.type, {edit: {documentChanges: []}})
  void connection.sendNotification('result', res)
})

connection.onNotification('register', async () => {
  void connection.client.register(RenameRequest.type, {
    prepareProvider: false
  })
})

connection.onNotification('registerBad', async () => {
  void connection.client.register(new ProtocolRequestType('not_exists'), {})
})

connection.onNotification('edits', async () => {
  let uris = documents.keys()
  let res = await connection.sendRequest(ApplyWorkspaceEditRequest.type, {
    edit: {
      documentChanges: uris.map(uri => {
        return {
          textDocument: {uri, version: documents.get(uri).version + 1},
          edits: [TextEdit.insert(Position.create(0, 0), 'foo')]
        }
      })
    }
  })
  void connection.sendNotification('result', res)
})

connection.onNotification('send', () => {
  void connection.sendRequest('customRequest')
  void connection.sendNotification('customNotification')
  void connection.sendProgress(WorkDoneProgress.type, '4fb247f8-0ede-415d-a80a-6629b6a9eaf8', {kind: 'end', message: 'end message'})
})

connection.onNotification('logMessage', () => {
  void connection.sendNotification(LogMessageNotification.type, {type: MessageType.Debug, message: 'msg'})
  void connection.sendNotification(LogMessageNotification.type, {type: MessageType.Error, message: 'msg'})
  void connection.sendNotification(LogMessageNotification.type, {type: MessageType.Info, message: 'msg'})
  void connection.sendNotification(LogMessageNotification.type, {type: MessageType.Log, message: 'msg'})
  void connection.sendNotification(LogMessageNotification.type, {type: MessageType.Warning, message: 'msg'})
})

connection.onNotification('showMessage', () => {
  void connection.sendNotification(ShowMessageNotification.type, {type: MessageType.Error, message: 'msg'})
  void connection.sendNotification(ShowMessageNotification.type, {type: MessageType.Info, message: 'msg'})
  void connection.sendNotification(ShowMessageNotification.type, {type: MessageType.Log, message: 'msg'})
  void connection.sendNotification(ShowMessageNotification.type, {type: MessageType.Warning, message: 'msg'})
})

connection.onNotification('requestMessage', async params => {
  await connection.sendRequest(ShowMessageRequest.type, {type: params.type, message: 'msg', actions: [{title: 'open'}]})
})

connection.onNotification('showDocument', async params => {
  await connection.sendRequest(ShowDocumentRequest.type, params)
})

connection.onProgress(WorkDoneProgress.type, '4b3a71d0-2b3f-46af-be2c-2827f548579f', (params) => {
  void connection.sendNotification('progressResult', params)
})

connection.onNotification('printMessage', () => {
  process.stdin.write('stdin\n')
  process.stdout.write('stdout\n')
})

connection.onRequest('doExit', () => {
  setTimeout(() => {
    process.exit(1)
  }, 30)
})

connection.listen()
