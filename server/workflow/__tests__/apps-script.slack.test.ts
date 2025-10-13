import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REAL_OPS, compileToAppsScript } from '../compile-to-appsscript';
import { runSingleFixture, loadAppsScriptFixtures, AppsScriptSandbox } from '../appsScriptDryRunHarness';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, 'apps-script-fixtures');

describe('Apps Script Slack REAL_OPS', () => {
  it('builds action.slack:test_connection', () => {
    expect(REAL_OPS['action.slack:test_connection']({})).toMatchSnapshot();
  });

  it('builds action.slack:send_message', () => {
    expect(REAL_OPS['action.slack:send_message']({})).toMatchSnapshot();
  });

  it('builds action.slack:create_channel', () => {
    expect(REAL_OPS['action.slack:create_channel']({})).toMatchSnapshot();
  });

  it('builds action.slack:invite_to_channel', () => {
    expect(REAL_OPS['action.slack:invite_to_channel']({})).toMatchSnapshot();
  });

  it('builds action.slack:upload_file', () => {
    expect(REAL_OPS['action.slack:upload_file']({})).toMatchSnapshot();
  });

  it('builds action.slack:get_channel_info', () => {
    expect(REAL_OPS['action.slack:get_channel_info']({})).toMatchSnapshot();
  });

  it('builds action.slack:list_channels', () => {
    expect(REAL_OPS['action.slack:list_channels']({})).toMatchSnapshot();
  });

  it('builds action.slack:get_user_info', () => {
    expect(REAL_OPS['action.slack:get_user_info']({})).toMatchSnapshot();
  });

  it('builds action.slack:list_users', () => {
    expect(REAL_OPS['action.slack:list_users']({})).toMatchSnapshot();
  });

  it('builds action.slack:add_reaction', () => {
    expect(REAL_OPS['action.slack:add_reaction']({})).toMatchSnapshot();
  });

  it('builds action.slack:remove_reaction', () => {
    expect(REAL_OPS['action.slack:remove_reaction']({})).toMatchSnapshot();
  });

  it('builds action.slack:schedule_message', () => {
    expect(REAL_OPS['action.slack:schedule_message']({})).toMatchSnapshot();
  });

  it('builds action.slack:conversations_history', () => {
    expect(REAL_OPS['action.slack:conversations_history']({})).toMatchSnapshot();
  });

  it('builds action.slack:list_files', () => {
    expect(REAL_OPS['action.slack:list_files']({})).toMatchSnapshot();
  });

  it('builds trigger.slack:message_received', () => {
    expect(REAL_OPS['trigger.slack:message_received']({})).toMatchSnapshot();
  });
});

describe('Apps Script Slack integration', () => {
  it('sends message via Slack REST API', async () => {
    const result = await runSingleFixture('slack-send-message', fixturesDir);
    expect(result.success).toBe(true);
    expect(result.context.slackSent).toBe(true);
    expect(result.context.slackChannel).toBe('C123');
    expect(result.context.slackMessageTs).toBe('1733756457.000200');
    expect(result.context.slackMessage).toEqual({
      type: 'message',
      text: 'Critical incident declared',
      user: 'U123',
      ts: '1733756457.000200',
    });
    expect(result.httpCalls).toHaveLength(1);
    expect(result.httpCalls[0].url).toBe('https://slack.com/api/chat.postMessage');
  });

  it('polls and deduplicates Slack messages', async () => {
    const fixtures = await loadAppsScriptFixtures(fixturesDir);
    const fixture = fixtures.find(entry => entry.id === 'slack-message-received');
    expect(fixture).toBeDefined();

    const compiled = compileToAppsScript(fixture!.graph);
    const codeFile = compiled.files.find(file => file.path === 'Code.gs');
    expect(codeFile).toBeDefined();

    const sandbox = new AppsScriptSandbox({
      secrets: fixture!.secrets ?? {},
      httpFixtures: fixture!.http ?? [],
    });

    sandbox.evaluate(codeFile!.content);

    const firstRun = await sandbox.runFunction('onSlackMessageReceived');
    expect(firstRun.context).toMatchObject({
      messagesDispatched: 2,
      channel: 'C12345678',
    });
    expect(firstRun.httpCalls).toHaveLength(1);
    expect(firstRun.httpCalls[0].url).toBe('https://slack.com/api/conversations.history?channel=C12345678&limit=200');

    const secondRun = await sandbox.runFunction('onSlackMessageReceived');
    expect(secondRun.context).toMatchObject({
      messagesDispatched: 0,
      channel: 'C12345678',
    });
    expect(secondRun.httpCalls).toHaveLength(2);
    expect(secondRun.httpCalls[1].url).toBe('https://slack.com/api/conversations.history?channel=C12345678&limit=200&oldest=1733756020.0002');

    sandbox.verifyHttpExpectations();
  });
});
