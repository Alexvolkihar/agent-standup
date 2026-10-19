// The band, against sessions written the way Claude Code writes them: `claude plugin test plugin-band`
import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const DIR = '/home/ana/.claude/sessions'
const at = (s: object) => JSON.stringify({ kind: 'interactive', version: '2.1.302', statusUpdatedAt: 1, ...s })
const files: Record<string, string> = {
  '101.json': at({ pid: 101, sessionId: 's-shop', status: 'waiting', waitingFor: 'permission prompt', cwd: '/work/web-shop', entrypoint: 'claude-vscode', name: 'web-shop-1f', nameSource: 'derived' }),
  '102.json': at({ pid: 102, sessionId: 's-api', status: 'waiting', waitingFor: 'dialog open', cwd: '/work/api' }),   // /model opened there by hand
  '103.json': at({ pid: 103, sessionId: 's-gone', status: 'waiting', waitingFor: 'input needed', cwd: '/work/old' }),   // its process crashed
  '104.json': at({ pid: 104, sessionId: 's-self', status: 'waiting', waitingFor: 'input needed', cwd: '/work/me' }),   // the session the band is drawn in
  '105.json': at({ pid: 105, sessionId: 's-docs', status: 'waiting', waitingFor: 'input needed', cwd: '/work/docs', name: 'release notes', nameSource: 'user', entrypoint: 'cli' }),
  '106.json': at({ pid: 106, sessionId: 's-busy', status: 'busy', cwd: '/work/busy' }),
  'notes.txt': 'not a session',
}
const bottom = (on: On) => {   // what the engine does beneath the plugins: start the session, draw its own empty band
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
}
const world = (on: On, list: Record<string, string>) => {
  mock.env(on, { HOME: '/home/ana' })
  on('session.id', () => ({ value: 's-self' }))
  on('fs.list', ($, e) => (e.path === DIR ? { value: Object.keys(list).map(name => ({ name, kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false })) } : { deny: 'ENOENT' }))
  on('fs.read', ($, e) => {
    const f = list[e.path.slice(DIR.length + 1)]
    return f === undefined ? { deny: 'ENOENT' } : { value: f }
  })
  on('process.run', ($, e) => ({ value: { exitCode: 0, stdout: String(e.argv[4] ?? '').split(',').filter(p => p !== '103').join('\n'), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))   // ps -o pid= -p <pids>: all but the crashed one run
  bottom(on)
  return mock.clock(on, { now: 0 })
}
const BAND = { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 100, scroll: { offset: 0, bodyRows: 11 }, view: {} }

test('the band lists the other sessions that wait on you, not a dialog opened by hand, a crashed one or this one', async ($, on) => {
  world(on, files)
  await $.session.start({ cwd: '/work/me', surface: 'terminal', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'agent-standup-band', surface, component: 'AbovePrompt', props: BAND })
    expect(await ui.find({ type: 'Text', text: /web-shop \(VS Code\)/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'docs · release notes' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'needs an approval' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /api|old|me|busy|1f/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('Hide puts the band away until another session needs you', async ($, on) => {
  const list = { ...files }, toasts: string[] = []
  const clock = world(on, list)
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  await $.session.start({ cwd: '/work/me', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'agent-standup-band', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  await ui.press({ key: 'hide' })
  expect(await ui.find({ type: 'Text', text: /web-shop/ })).toBeUndefined()
  list['107.json'] = at({ pid: 107, sessionId: 's-new', status: 'waiting', waitingFor: 'permission prompt', cwd: '/work/new' })
  list['106.json'] = at({ pid: 106, sessionId: 's-busy', status: 'idle', cwd: '/work/busy' })   // finished its turn
  await clock.advance(4000)
  expect(await ui.find({ type: 'Text', text: /new/ })).toBeDefined()
  expect(toasts).toEqual(['✓ busy has finished: your turn there', '✋ new needs an approval'])   // nothing about what was already so at the first look
  await ui.unmount()
})

test('no sessions folder (Claude Code before 2.1.294): no band, no error', async ($, on) => {
  mock.env(on, { HOME: '/home/ana' })
  on('session.id', () => ({ value: 's-self' }))
  on('fs.list', () => ({ deny: 'ENOENT' }))
  bottom(on)
  mock.clock(on, { now: 0 })
  await $.session.start({ cwd: '/work/me', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'agent-standup-band', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ type: 'Text', text: /needs/ })).toBeUndefined()
  await ui.unmount()
})
