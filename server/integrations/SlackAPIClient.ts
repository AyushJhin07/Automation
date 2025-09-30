import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient';

interface SlackMessageParams {
  channel: string;
  text: string;
  thread_ts?: string;
  blocks?: any[];
  attachments?: any[];
  icon_emoji?: string;
  username?: string;
}

interface SlackInviteParams {
  channel: string;
  users: string | string[];
}

interface SlackUploadParams {
  channels?: string;
  content: string;
  filename: string;
  filetype?: string;
  initial_comment?: string;
  title?: string;
}

interface SlackChannelParams {
  channel: string;
}

interface SlackScheduleParams {
  channel: string;
  text: string;
  post_at: number;
  thread_ts?: string;
}

interface SlackReactionParams {
  channel: string;
  timestamp: string;
  name: string;
}

interface SlackListChannelsParams {
  types?: string;
  limit?: number;
  cursor?: string;
}

interface SlackListUsersParams {
  limit?: number;
  cursor?: string;
}

interface SlackUserParams {
  user: string;
}

interface SlackCreateChannelParams {
  name: string;
  is_private?: boolean;
}

interface SlackAPIResponse<T = any> {
  ok: boolean;
  error?: string;
  [key: string]: any;
  result?: T;
}

/**
 * Minimal Slack Web API client backed by the shared BaseAPIClient implementation.
 * Only the operations that the automation runtime invokes are implemented here so we can
 * reliably execute Slack nodes at runtime without falling back to "not implemented" errors.
 */
export class SlackAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    if (!credentials.accessToken) {
      throw new Error('Slack integration requires an access token');
    }

    super('https://slack.com/api', credentials);

    // Register generic handlers for IntegrationManager.execute()
    this.registerHandlers({
      'test_connection': this.testConnection.bind(this) as any,
      'send_message': this.sendMessage.bind(this) as any,
      'create_channel': this.createChannel.bind(this) as any,
      'invite_to_channel': this.inviteToChannel.bind(this) as any,
      'upload_file': this.uploadFile.bind(this) as any,
      'get_channel_info': this.getChannelInfo.bind(this) as any,
      'list_channels': this.listChannels.bind(this) as any,
      'get_user_info': this.getUserInfo.bind(this) as any,
      'list_users': this.listUsers.bind(this) as any,
      'add_reaction': this.addReaction.bind(this) as any,
      'remove_reaction': this.removeReaction.bind(this) as any,
      'schedule_message': this.scheduleMessage.bind(this) as any,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.credentials.accessToken}`
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    const response = await this.post<SlackAPIResponse>('/auth.test');
    return this.normalizeSlackResponse(response);
  }

  public async sendMessage(params: SlackMessageParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['channel', 'text']);

    const response = await this.post<SlackAPIResponse>('/chat.postMessage', {
      channel: params.channel,
      text: params.text,
      thread_ts: params.thread_ts,
      blocks: params.blocks,
      attachments: params.attachments,
      icon_emoji: params.icon_emoji,
      username: params.username
    });

    return this.normalizeSlackResponse(response);
  }

  public async createChannel(params: SlackCreateChannelParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['name']);

    const response = await this.post<SlackAPIResponse>('/conversations.create', {
      name: params.name,
      is_private: params.is_private ?? false
    });

    return this.normalizeSlackResponse(response);
  }

  public async inviteToChannel(params: SlackInviteParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['channel', 'users']);

    const users = Array.isArray(params.users) ? params.users.join(',') : params.users;
    const response = await this.post<SlackAPIResponse>('/conversations.invite', {
      channel: params.channel,
      users
    });

    return this.normalizeSlackResponse(response);
  }

  public async uploadFile(params: SlackUploadParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['content', 'filename']);

    const form = new FormData();
    form.set('content', params.content);
    form.set('filename', params.filename);
    if (params.channels) form.set('channels', params.channels);
    if (params.filetype) form.set('filetype', params.filetype);
    if (params.initial_comment) form.set('initial_comment', params.initial_comment);
    if (params.title) form.set('title', params.title);

    const response = await fetch(`${this.baseURL}/files.upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`
      },
      body: form
    });

    const data = (await response.json()) as SlackAPIResponse;
    if (!response.ok || !data.ok) {
      return {
        success: false,
        error: data.error || `HTTP ${response.status}`,
        data
      };
    }

    return {
      success: true,
      data
    };
  }

  public async getChannelInfo(params: SlackChannelParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['channel']);
    const response = await this.get<SlackAPIResponse>(
      `/conversations.info${this.buildQueryString({ channel: params.channel })}`
    );

    return this.normalizeSlackResponse(response);
  }

  public async listChannels(params: SlackListChannelsParams = {}): Promise<APIResponse<any>> {
    const response = await this.get<SlackAPIResponse>(
      `/conversations.list${this.buildQueryString({
        types: params.types,
        limit: params.limit,
        cursor: params.cursor
      })}`
    );

    return this.normalizeSlackResponse(response);
  }

  public async getUserInfo(params: SlackUserParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['user']);
    const response = await this.get<SlackAPIResponse>(
      `/users.info${this.buildQueryString({ user: params.user })}`
    );

    return this.normalizeSlackResponse(response);
  }

  public async listUsers(params: SlackListUsersParams = {}): Promise<APIResponse<any>> {
    const response = await this.get<SlackAPIResponse>(
      `/users.list${this.buildQueryString({ limit: params.limit, cursor: params.cursor })}`
    );

    return this.normalizeSlackResponse(response);
  }

  public async addReaction(params: SlackReactionParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['channel', 'timestamp', 'name']);

    const response = await this.post<SlackAPIResponse>('/reactions.add', {
      channel: params.channel,
      timestamp: params.timestamp,
      name: params.name
    });

    return this.normalizeSlackResponse(response);
  }

  public async removeReaction(params: SlackReactionParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['channel', 'timestamp', 'name']);

    const response = await this.post<SlackAPIResponse>('/reactions.remove', {
      channel: params.channel,
      timestamp: params.timestamp,
      name: params.name
    });

    return this.normalizeSlackResponse(response);
  }

  public async scheduleMessage(params: SlackScheduleParams): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['channel', 'text', 'post_at']);

    const response = await this.post<SlackAPIResponse>('/chat.scheduleMessage', {
      channel: params.channel,
      text: params.text,
      post_at: params.post_at,
      thread_ts: params.thread_ts
    });

    return this.normalizeSlackResponse(response);
  }

  private normalizeSlackResponse<T>(response: APIResponse<SlackAPIResponse<T>>): APIResponse<T> {
    if (!response.success) {
      return response as APIResponse<T>;
    }

    const body = response.data;
    if (!body) {
      return {
        success: true
      };
    }

    if (!body.ok) {
      return {
        success: false,
        error: body.error || 'Unknown Slack API error',
        data: body as any
      };
    }

    const { ok, error, ...rest } = body;
    return {
      success: true,
      data: rest as T
    };
  }
}
