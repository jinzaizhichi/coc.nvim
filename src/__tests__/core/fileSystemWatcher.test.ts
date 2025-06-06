import bser from 'bser'
import net from 'net'
import os from 'os'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { Disposable } from 'vscode-languageserver-protocol'
import { URI } from 'vscode-uri'
import Configurations from '../../configuration/index'
import { FileSystemWatcher, FileSystemWatcherManager } from '../../core/fileSystemWatcher'
import Watchman, { FileChangeItem } from '../../core/watchman'
import WorkspaceFolderController from '../../core/workspaceFolder'
import RelativePattern from '../../model/relativePattern'
import { GlobPattern } from '../../types'
import { disposeAll } from '../../util'
import { remove } from '../../util/fs'
import helper from '../helper'

let server: net.Server
let client: net.Socket
const cwd = path.resolve(__dirname, '../../..')
const sockPath = path.join(os.tmpdir(), `watchman-fake-${uuid()}`)
process.env.WATCHMAN_SOCK = sockPath

let workspaceFolder: WorkspaceFolderController
let watcherManager: FileSystemWatcherManager
let configurations: Configurations
let disposables: Disposable[] = []

function wait(ms: number): Promise<any> {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(undefined)
    }, ms)
  })
}

function createFileChange(file: string, isNew = true, exists = true): FileChangeItem {
  return {
    size: 1,
    name: file,
    exists,
    new: isNew,
    type: 'f',
    mtime_ms: Date.now()
  }
}

function sendResponse(data: any): void {
  client.write(bser.dumpToBuffer(data))
}

function sendSubscription(uid: string, root: string, files: FileChangeItem[]): void {
  client.write(bser.dumpToBuffer({
    subscription: uid,
    root,
    files
  }))
}

let capabilities: any
let watchResponse: any
let defaultConfig = { watchmanPath: null, enable: true, ignoredFolders: [] }
beforeAll(async () => {
  await helper.setup()
})

beforeAll(done => {
  let userConfigFile = path.join(process.env.COC_VIMCONFIG, 'coc-settings.json')
  configurations = new Configurations(userConfigFile, undefined)
  workspaceFolder = new WorkspaceFolderController(configurations)
  watcherManager = new FileSystemWatcherManager(workspaceFolder, defaultConfig)
  Object.assign(watcherManager, { disabled: false })
  watcherManager.attach(helper.createNullChannel())
  // create a mock sever for watchman
  server = net.createServer(c => {
    client = c
    c.on('data', data => {
      let obj = bser.loadFromBuffer(data)
      if (obj[0] == 'watch-project') {
        sendResponse(watchResponse || { watch: obj[1], warning: 'warning' })
      } else if (obj[0] == 'unsubscribe') {
        sendResponse({ path: obj[1] })
      } else if (obj[0] == 'clock') {
        sendResponse({ clock: 'clock' })
      } else if (obj[0] == 'version') {
        let { optional, required } = obj[1]
        let res = {}
        for (let key of optional) {
          res[key] = true
        }
        for (let key of required) {
          res[key] = true
        }
        sendResponse({ capabilities: capabilities || res })
      } else if (obj[0] == 'subscribe') {
        sendResponse({ subscribe: obj[2] })
      } else {
        sendResponse({})
      }
    })
  })
  server.on('error', err => {
    throw err
  })
  server.listen(sockPath, () => {
    done()
  })
  server.unref()
})

afterEach(async () => {
  disposeAll(disposables)
  capabilities = undefined
  watchResponse = undefined
})

afterAll(async () => {
  await helper.shutdown()
  watcherManager.dispose()
  server.close()
  await remove(sockPath)
})

describe('watchman', () => {
  it('should not throw error when not watching', async () => {
    let client = new Watchman(null)
    disposables.push(client)
    let disposable = client.subscribe('**/*', () => {})
    disposable.dispose()
    client.dispose()
  })

  it('should checkCapability', async () => {
    let client = new Watchman(null)
    let res = await client.checkCapability()
    expect(res).toBe(true)
    capabilities = { relative_root: false }
    res = await client.checkCapability()
    expect(res).toBe(false)
    client.dispose()
  })

  it('should watchProject', async () => {
    let client = new Watchman(null)
    disposables.push(client)
    let res = await client.watchProject(__dirname)
    expect(res).toBe(true)
    client.dispose()
  })

  it('should unsubscribe', async () => {
    let client = new Watchman(null)
    disposables.push(client)
    await client.watchProject(cwd)
    let fn = jest.fn()
    let disposable = client.subscribe(`${cwd}/*`, fn)
    disposable.dispose()
    client.dispose()
  })
})

describe('Watchman#subscribe', () => {

  it('should subscribe file change', async () => {
    let client = new Watchman(null, helper.createNullChannel())
    disposables.push(client)
    await client.watchProject(cwd)
    let called = false
    let disposable = client.subscribe(`${cwd}/*`, () => {
      called = true
    })
    let changes: FileChangeItem[] = [createFileChange(`${cwd}/a`)]
    sendSubscription(client.subscription, cwd, changes)
    await helper.wait(30)
    expect(called).toBe(true)
    disposable.dispose()
    client.dispose()
  })

  it('should subscribe with relative_path', async () => {
    let client = new Watchman(null, helper.createNullChannel())
    watchResponse = { watch: cwd, relative_path: 'foo' }
    await client.watchProject(cwd)
    let fn = jest.fn()
    let disposable = client.subscribe(`${cwd}/*`, fn)
    let changes: FileChangeItem[] = [createFileChange(`${cwd}/a`)]
    sendSubscription(client.subscription, cwd, changes)
    await wait(30)
    expect(fn).toHaveBeenCalled()
    let call = fn.mock.calls[0][0]
    disposable.dispose()
    expect(call.root).toBe(path.join(cwd, 'foo'))
    client.dispose()
  })

  it('should not subscribe invalid response', async () => {
    let c = new Watchman(null, helper.createNullChannel())
    disposables.push(c)
    watchResponse = { watch: cwd, relative_path: 'foo' }
    await c.watchProject(cwd)
    let fn = jest.fn()
    c.subscribe(`${cwd}/*`, fn)
    let changes: FileChangeItem[] = [createFileChange(`${cwd}/a`)]
    sendSubscription('uuid', cwd, changes)
    await wait(10)
    sendSubscription(c.subscription, cwd, [])
    await wait(10)
    client.write(bser.dumpToBuffer({
      subscription: c.subscription,
      root: cwd
    }))
    await wait(10)
    expect(fn).toHaveBeenCalledTimes(0)
  })
})

describe('Watchman#createClient', () => {
  it('should not create client when capabilities not match', async () => {
    capabilities = { relative_root: false }
    await expect(async () => {
      await Watchman.createClient(null, cwd)
    }).rejects.toThrow(Error)
  })

  it('should not create when watch failed', async () => {
    watchResponse = {}
    await expect(async () => {
      await Watchman.createClient(null, cwd)
    }).rejects.toThrow(Error)
  })

  it('should create client', async () => {
    let client = await Watchman.createClient(null, cwd)
    disposables.push(client)
    expect(client).toBeDefined()
  })
})

describe('fileSystemWatcher', () => {

  async function createWatcher(pattern: GlobPattern, ignoreCreateEvents = false, ignoreChangeEvents = false, ignoreDeleteEvents = false): Promise<FileSystemWatcher> {
    let watcher = watcherManager.createFileSystemWatcher(
      pattern,
      ignoreCreateEvents,
      ignoreChangeEvents,
      ignoreDeleteEvents
    )
    disposables.push(watcher)
    return watcher
  }

  beforeAll(async () => {
    workspaceFolder.addWorkspaceFolder(cwd, true)
    await watcherManager.waitClient(cwd)
  })

  it('should use relative pattern #1', async () => {
    let folder = workspaceFolder.workspaceFolders[0]
    expect(folder).toBeDefined()
    let pattern = new RelativePattern(folder, '**/*')
    let watcher = await createWatcher(pattern, false, true, true)
    let fn = jest.fn()
    watcher.onDidCreate(fn)
    let changes: FileChangeItem[] = [createFileChange(`a`)]
    sendSubscription(watcher.subscribe, cwd, changes)
    await helper.wait(30)
    expect(fn).toHaveBeenCalled()
  })

  it('should use relative pattern #2', async () => {
    let called = false
    let pattern = new RelativePattern(__dirname, '**/*')
    let watcher = await createWatcher(pattern, false, true, true)
    watcher.onDidCreate(() => {
      called = true
    })
    let changes: FileChangeItem[] = [createFileChange(`a`)]
    sendSubscription(watcher.subscribe, cwd, changes)
    await helper.wait(30)
    expect(called).toBe(false)
  })

  it('should use relative pattern #3', async () => {
    let called = false
    let root = path.join(process.cwd(), 'not_exists')
    let pattern = new RelativePattern(root, '**/*')
    let watcher = await createWatcher(pattern, false, true, true)
    watcher.onDidCreate(() => {
      called = true
    })
    await helper.wait(10)
    let changes: FileChangeItem[] = [createFileChange(`a`)]
    sendSubscription(watcher.subscribe, cwd, changes)
    await helper.wait(10)
    expect(called).toBe(false)
  })

  it('should watch for file create', async () => {
    let watcher = await createWatcher('**/*', false, true, true)
    let called = false
    watcher.onDidCreate(() => {
      called = true
    })
    let changes: FileChangeItem[] = [createFileChange(`a`)]
    sendSubscription(watcher.subscribe, cwd, changes)
    await helper.waitValue(() => {
      return called
    }, true)
  })

  it('should watch for file delete', async () => {
    let watcher = await createWatcher('**/*', true, true, false)
    let called = false
    watcher.onDidDelete(() => {
      called = true
    })
    let changes: FileChangeItem[] = [createFileChange(`a`, false, false)]
    sendSubscription(watcher.subscribe, cwd, changes)
    await helper.waitValue(() => {
      return called
    }, true)
  })

  it('should watch for file change', async () => {
    let watcher = await createWatcher('**/*', false, false, false)
    let called = false
    watcher.onDidChange(() => {
      called = true
    })
    let changes: FileChangeItem[] = [createFileChange(`a`, false, true)]
    sendSubscription(watcher.subscribe, cwd, changes)
    await helper.waitValue(() => {
      return called
    }, true)
  })

  it('should watch for file rename', async () => {
    let watcher = await createWatcher('**/*', false, false, false)
    let called = false
    watcher.onDidRename(() => {
      called = true
    })
    await helper.wait(50)
    let changes: FileChangeItem[] = [
      createFileChange(`a`, false, false),
      createFileChange(`b`, true, true),
    ]
    sendSubscription(watcher.subscribe, cwd, changes)
    await helper.waitValue(() => {
      return called
    }, true)
  })

  it('should not watch for events', async () => {
    let watcher = await createWatcher('**/*', true, true, true)
    let called = false
    let onChange = () => { called = true }
    watcher.onDidCreate(onChange)
    watcher.onDidChange(onChange)
    watcher.onDidDelete(onChange)
    let changes: FileChangeItem[] = [
      createFileChange(`a`, false, false),
      createFileChange(`b`, true, true),
      createFileChange(`c`, false, true),
    ]
    sendSubscription(watcher.subscribe, cwd, changes)
    await helper.wait(10)
    expect(called).toBe(false)
  })

  it('should watch for folder rename', async () => {
    let watcher = await createWatcher('**/*')
    let newFiles: string[] = []
    let count = 0
    watcher.onDidRename(e => {
      count++
      newFiles.push(e.newUri.fsPath)
    })
    let changes: FileChangeItem[] = [
      createFileChange(`a/1`, false, false),
      createFileChange(`a/2`, false, false),
      createFileChange(`b/1`, true, true),
      createFileChange(`b/2`, true, true),
    ]
    sendSubscription(watcher.subscribe, cwd, changes)
    await helper.waitValue(() => {
      return count
    }, 2)
  })

  it('should watch for new folder', async () => {
    let watcher = await createWatcher('**/*')
    expect(watcher).toBeDefined()
    workspaceFolder.renameWorkspaceFolder(cwd, __dirname)
    let uri: URI
    watcher.onDidCreate(e => {
      uri = e
    })
    await watcherManager.waitClient(__dirname)
    let changes: FileChangeItem[] = [createFileChange(`a`)]
    sendSubscription(watcher.subscribe, __dirname, changes)
    await helper.waitValue(() => {
      return uri?.fsPath
    }, path.join(__dirname, 'a'))
  })
})

describe('create FileSystemWatcherManager', () => {
  it('should attach to existing workspace folder', async () => {
    let workspaceFolder = new WorkspaceFolderController(configurations)
    workspaceFolder.addWorkspaceFolder(cwd, false)
    let watcherManager = new FileSystemWatcherManager(workspaceFolder, { ...defaultConfig, enable: false })
    watcherManager.disabled = false
    watcherManager.attach(helper.createNullChannel())
    await watcherManager.createClient(cwd)
    await watcherManager.waitClient(cwd)
    watcherManager.dispose()
  })

  it('should get watchman path', async () => {
    let watcherManager = new FileSystemWatcherManager(workspaceFolder, { ...defaultConfig, watchmanPath: 'invalid_command' })
    process.env.WATCHMAN_SOCK = ''
    await expect(async () => {
      await watcherManager.getWatchmanPath()
    }).rejects.toThrow(Error)
    process.env.WATCHMAN_SOCK = sockPath
  })
})
