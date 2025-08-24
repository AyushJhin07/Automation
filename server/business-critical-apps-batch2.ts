// BUSINESS CRITICAL APPLICATIONS - BATCH 2
// Continuing the comprehensive function expansion for Stage 2

import { AppFunction } from './comprehensive-app-functions';

// ===== AIRTABLE - COMPLETE FUNCTION SET (DATABASE) =====
export const AIRTABLE_FUNCTIONS: AppFunction[] = [
  // === RECORD MANAGEMENT ===
  {
    id: 'create_record',
    name: 'Create Record',
    description: 'Create a new record in Airtable base',
    category: 'action',
    parameters: {
      base_id: { type: 'string', required: true, description: 'Base ID' },
      table_name: { type: 'string', required: true, description: 'Table name' },
      fields: { type: 'object', required: true, description: 'Record fields' },
      typecast: { type: 'boolean', required: false, description: 'Automatically format data', default: false }
    },
    requiredScopes: ['data:write']
  },
  {
    id: 'update_record',
    name: 'Update Record',
    description: 'Update existing record',
    category: 'action',
    parameters: {
      base_id: { type: 'string', required: true, description: 'Base ID' },
      table_name: { type: 'string', required: true, description: 'Table name' },
      record_id: { type: 'string', required: true, description: 'Record ID' },
      fields: { type: 'object', required: true, description: 'Fields to update' },
      typecast: { type: 'boolean', required: false, description: 'Automatically format data', default: false }
    },
    requiredScopes: ['data:write']
  },
  {
    id: 'get_records',
    name: 'Get Records',
    description: 'Retrieve records from table',
    category: 'both',
    parameters: {
      base_id: { type: 'string', required: true, description: 'Base ID' },
      table_name: { type: 'string', required: true, description: 'Table name' },
      view: { type: 'string', required: false, description: 'View name' },
      filter_by_formula: { type: 'string', required: false, description: 'Airtable formula filter' },
      sort: { type: 'array', required: false, description: 'Sort criteria' },
      max_records: { type: 'number', required: false, description: 'Maximum records to return', default: 100 }
    },
    requiredScopes: ['data:read']
  },
  {
    id: 'delete_record',
    name: 'Delete Record',
    description: 'Delete record from table',
    category: 'action',
    parameters: {
      base_id: { type: 'string', required: true, description: 'Base ID' },
      table_name: { type: 'string', required: true, description: 'Table name' },
      record_id: { type: 'string', required: true, description: 'Record ID to delete' }
    },
    requiredScopes: ['data:write']
  },
  {
    id: 'search_records',
    name: 'Search Records',
    description: 'Search records using formula',
    category: 'both',
    parameters: {
      base_id: { type: 'string', required: true, description: 'Base ID' },
      table_name: { type: 'string', required: true, description: 'Table name' },
      formula: { type: 'string', required: true, description: 'Search formula' },
      fields: { type: 'array', required: false, description: 'Fields to return' }
    },
    requiredScopes: ['data:read']
  },
  
  // === BASE MANAGEMENT ===
  {
    id: 'get_base_schema',
    name: 'Get Base Schema',
    description: 'Get base structure and field definitions',
    category: 'both',
    parameters: {
      base_id: { type: 'string', required: true, description: 'Base ID' }
    },
    requiredScopes: ['schema:read']
  },
  {
    id: 'list_tables',
    name: 'List Tables',
    description: 'List all tables in base',
    category: 'both',
    parameters: {
      base_id: { type: 'string', required: true, description: 'Base ID' }
    },
    requiredScopes: ['schema:read']
  },
  
  // === BATCH OPERATIONS ===
  {
    id: 'batch_create_records',
    name: 'Batch Create Records',
    description: 'Create multiple records at once',
    category: 'action',
    parameters: {
      base_id: { type: 'string', required: true, description: 'Base ID' },
      table_name: { type: 'string', required: true, description: 'Table name' },
      records: { type: 'array', required: true, description: 'Array of record objects' },
      typecast: { type: 'boolean', required: false, description: 'Automatically format data', default: false }
    },
    requiredScopes: ['data:write']
  },
  {
    id: 'batch_update_records',
    name: 'Batch Update Records',
    description: 'Update multiple records at once',
    category: 'action',
    parameters: {
      base_id: { type: 'string', required: true, description: 'Base ID' },
      table_name: { type: 'string', required: true, description: 'Table name' },
      records: { type: 'array', required: true, description: 'Array of record updates with IDs' },
      typecast: { type: 'boolean', required: false, description: 'Automatically format data', default: false }
    },
    requiredScopes: ['data:write']
  },
  
  // === TRIGGERS ===
  {
    id: 'record_created',
    name: 'Record Created',
    description: 'Trigger when new record is created',
    category: 'trigger',
    parameters: {
      base_id: { type: 'string', required: false, description: 'Monitor specific base' },
      table_name: { type: 'string', required: false, description: 'Monitor specific table' }
    },
    requiredScopes: ['data:read']
  },
  {
    id: 'record_updated',
    name: 'Record Updated',
    description: 'Trigger when record is modified',
    category: 'trigger',
    parameters: {
      base_id: { type: 'string', required: false, description: 'Monitor specific base' },
      table_name: { type: 'string', required: false, description: 'Monitor specific table' },
      field_filter: { type: 'string', required: false, description: 'Monitor specific field changes' }
    },
    requiredScopes: ['data:read']
  }
];

// ===== DROPBOX - COMPLETE FUNCTION SET (CLOUD STORAGE) =====
export const DROPBOX_FUNCTIONS: AppFunction[] = [
  // === FILE MANAGEMENT ===
  {
    id: 'upload_file',
    name: 'Upload File',
    description: 'Upload file to Dropbox',
    category: 'action',
    parameters: {
      path: { type: 'string', required: true, description: 'File path in Dropbox' },
      content: { type: 'string', required: true, description: 'File content or local path' },
      mode: { type: 'string', required: false, description: 'Upload mode', options: ['add', 'overwrite', 'update'], default: 'add' },
      autorename: { type: 'boolean', required: false, description: 'Auto-rename if file exists', default: false },
      mute: { type: 'boolean', required: false, description: 'Mute notifications', default: false }
    },
    requiredScopes: ['files.content.write']
  },
  {
    id: 'download_file',
    name: 'Download File',
    description: 'Download file from Dropbox',
    category: 'action',
    parameters: {
      path: { type: 'string', required: true, description: 'File path in Dropbox' },
      save_path: { type: 'string', required: false, description: 'Local save path' }
    },
    requiredScopes: ['files.content.read']
  },
  {
    id: 'delete_file',
    name: 'Delete File',
    description: 'Delete file or folder',
    category: 'action',
    parameters: {
      path: { type: 'string', required: true, description: 'Path to delete' }
    },
    requiredScopes: ['files.content.write']
  },
  {
    id: 'move_file',
    name: 'Move File',
    description: 'Move or rename file/folder',
    category: 'action',
    parameters: {
      from_path: { type: 'string', required: true, description: 'Source path' },
      to_path: { type: 'string', required: true, description: 'Destination path' },
      allow_shared_folder: { type: 'boolean', required: false, description: 'Allow moving to shared folder', default: false },
      autorename: { type: 'boolean', required: false, description: 'Auto-rename if destination exists', default: false }
    },
    requiredScopes: ['files.content.write']
  },
  {
    id: 'copy_file',
    name: 'Copy File',
    description: 'Copy file or folder',
    category: 'action',
    parameters: {
      from_path: { type: 'string', required: true, description: 'Source path' },
      to_path: { type: 'string', required: true, description: 'Destination path' },
      allow_shared_folder: { type: 'boolean', required: false, description: 'Allow copying to shared folder', default: false },
      autorename: { type: 'boolean', required: false, description: 'Auto-rename if destination exists', default: false }
    },
    requiredScopes: ['files.content.write']
  },
  {
    id: 'get_file_metadata',
    name: 'Get File Metadata',
    description: 'Get file or folder metadata',
    category: 'both',
    parameters: {
      path: { type: 'string', required: true, description: 'File or folder path' },
      include_media_info: { type: 'boolean', required: false, description: 'Include media metadata', default: false },
      include_deleted: { type: 'boolean', required: false, description: 'Include deleted files', default: false }
    },
    requiredScopes: ['files.metadata.read']
  },
  
  // === FOLDER MANAGEMENT ===
  {
    id: 'create_folder',
    name: 'Create Folder',
    description: 'Create new folder',
    category: 'action',
    parameters: {
      path: { type: 'string', required: true, description: 'Folder path to create' },
      autorename: { type: 'boolean', required: false, description: 'Auto-rename if folder exists', default: false }
    },
    requiredScopes: ['files.content.write']
  },
  {
    id: 'list_folder',
    name: 'List Folder',
    description: 'List folder contents',
    category: 'both',
    parameters: {
      path: { type: 'string', required: false, description: 'Folder path (root if empty)', default: '' },
      recursive: { type: 'boolean', required: false, description: 'List recursively', default: false },
      include_media_info: { type: 'boolean', required: false, description: 'Include media info', default: false },
      include_deleted: { type: 'boolean', required: false, description: 'Include deleted files', default: false },
      limit: { type: 'number', required: false, description: 'Maximum entries', default: 2000 }
    },
    requiredScopes: ['files.metadata.read']
  },
  
  // === SHARING ===
  {
    id: 'create_shared_link',
    name: 'Create Shared Link',
    description: 'Create shareable link for file/folder',
    category: 'action',
    parameters: {
      path: { type: 'string', required: true, description: 'Path to share' },
      short_url: { type: 'boolean', required: false, description: 'Create short URL', default: false },
      pending_upload: { type: 'object', required: false, description: 'Pending upload settings' }
    },
    requiredScopes: ['sharing.write']
  },
  {
    id: 'list_shared_links',
    name: 'List Shared Links',
    description: 'List existing shared links',
    category: 'both',
    parameters: {
      path: { type: 'string', required: false, description: 'Filter by path' },
      cursor: { type: 'string', required: false, description: 'Pagination cursor' }
    },
    requiredScopes: ['sharing.read']
  },
  
  // === SEARCH ===
  {
    id: 'search_files',
    name: 'Search Files',
    description: 'Search for files and folders',
    category: 'both',
    parameters: {
      query: { type: 'string', required: true, description: 'Search query' },
      path: { type: 'string', required: false, description: 'Limit search to path' },
      max_results: { type: 'number', required: false, description: 'Maximum results', default: 100 },
      file_status: { type: 'string', required: false, description: 'File status filter', options: ['active', 'deleted'] },
      filename_only: { type: 'boolean', required: false, description: 'Search filenames only', default: false }
    },
    requiredScopes: ['files.metadata.read']
  },
  
  // === TRIGGERS ===
  {
    id: 'file_uploaded',
    name: 'File Uploaded',
    description: 'Trigger when file is uploaded',
    category: 'trigger',
    parameters: {
      path_filter: { type: 'string', required: false, description: 'Monitor specific path' }
    },
    requiredScopes: ['files.metadata.read']
  },
  {
    id: 'file_modified',
    name: 'File Modified',
    description: 'Trigger when file is modified',
    category: 'trigger',
    parameters: {
      path_filter: { type: 'string', required: false, description: 'Monitor specific path' }
    },
    requiredScopes: ['files.metadata.read']
  }
];

// ===== GITHUB - COMPLETE FUNCTION SET (VERSION CONTROL) =====
export const GITHUB_FUNCTIONS: AppFunction[] = [
  // === REPOSITORY MANAGEMENT ===
  {
    id: 'create_repository',
    name: 'Create Repository',
    description: 'Create a new GitHub repository',
    category: 'action',
    parameters: {
      name: { type: 'string', required: true, description: 'Repository name' },
      description: { type: 'string', required: false, description: 'Repository description' },
      private: { type: 'boolean', required: false, description: 'Private repository', default: false },
      has_issues: { type: 'boolean', required: false, description: 'Enable issues', default: true },
      has_projects: { type: 'boolean', required: false, description: 'Enable projects', default: true },
      has_wiki: { type: 'boolean', required: false, description: 'Enable wiki', default: true },
      auto_init: { type: 'boolean', required: false, description: 'Initialize with README', default: false },
      gitignore_template: { type: 'string', required: false, description: 'Gitignore template' },
      license_template: { type: 'string', required: false, description: 'License template' }
    },
    requiredScopes: ['repo']
  },
  {
    id: 'get_repository',
    name: 'Get Repository',
    description: 'Get repository information',
    category: 'both',
    parameters: {
      owner: { type: 'string', required: true, description: 'Repository owner' },
      repo: { type: 'string', required: true, description: 'Repository name' }
    },
    requiredScopes: ['repo']
  },
  {
    id: 'list_repositories',
    name: 'List Repositories',
    description: 'List user repositories',
    category: 'both',
    parameters: {
      visibility: { type: 'string', required: false, description: 'Repository visibility', options: ['all', 'public', 'private'], default: 'all' },
      affiliation: { type: 'string', required: false, description: 'Repository affiliation', default: 'owner,collaborator,organization_member' },
      type: { type: 'string', required: false, description: 'Repository type', options: ['all', 'owner', 'public', 'private', 'member'], default: 'all' },
      sort: { type: 'string', required: false, description: 'Sort order', options: ['created', 'updated', 'pushed', 'full_name'], default: 'full_name' },
      per_page: { type: 'number', required: false, description: 'Results per page', default: 30 }
    },
    requiredScopes: ['repo']
  },
  
  // === ISSUE MANAGEMENT ===
  {
    id: 'create_issue',
    name: 'Create Issue',
    description: 'Create a new issue',
    category: 'action',
    parameters: {
      owner: { type: 'string', required: true, description: 'Repository owner' },
      repo: { type: 'string', required: true, description: 'Repository name' },
      title: { type: 'string', required: true, description: 'Issue title' },
      body: { type: 'string', required: false, description: 'Issue description' },
      assignees: { type: 'array', required: false, description: 'Assignee usernames' },
      milestone: { type: 'number', required: false, description: 'Milestone number' },
      labels: { type: 'array', required: false, description: 'Issue labels' }
    },
    requiredScopes: ['repo']
  },
  {
    id: 'update_issue',
    name: 'Update Issue',
    description: 'Update an existing issue',
    category: 'action',
    parameters: {
      owner: { type: 'string', required: true, description: 'Repository owner' },
      repo: { type: 'string', required: true, description: 'Repository name' },
      issue_number: { type: 'number', required: true, description: 'Issue number' },
      title: { type: 'string', required: false, description: 'Issue title' },
      body: { type: 'string', required: false, description: 'Issue description' },
      state: { type: 'string', required: false, description: 'Issue state', options: ['open', 'closed'] },
      assignees: { type: 'array', required: false, description: 'Assignee usernames' },
      labels: { type: 'array', required: false, description: 'Issue labels' }
    },
    requiredScopes: ['repo']
  },
  {
    id: 'list_issues',
    name: 'List Issues',
    description: 'List repository issues',
    category: 'both',
    parameters: {
      owner: { type: 'string', required: true, description: 'Repository owner' },
      repo: { type: 'string', required: true, description: 'Repository name' },
      milestone: { type: 'string', required: false, description: 'Milestone filter' },
      state: { type: 'string', required: false, description: 'Issue state', options: ['open', 'closed', 'all'], default: 'open' },
      assignee: { type: 'string', required: false, description: 'Assignee filter' },
      creator: { type: 'string', required: false, description: 'Creator filter' },
      labels: { type: 'string', required: false, description: 'Label filter (comma-separated)' },
      sort: { type: 'string', required: false, description: 'Sort order', options: ['created', 'updated', 'comments'], default: 'created' },
      per_page: { type: 'number', required: false, description: 'Results per page', default: 30 }
    },
    requiredScopes: ['repo']
  },
  
  // === PULL REQUEST MANAGEMENT ===
  {
    id: 'create_pull_request',
    name: 'Create Pull Request',
    description: 'Create a new pull request',
    category: 'action',
    parameters: {
      owner: { type: 'string', required: true, description: 'Repository owner' },
      repo: { type: 'string', required: true, description: 'Repository name' },
      title: { type: 'string', required: true, description: 'Pull request title' },
      head: { type: 'string', required: true, description: 'Source branch' },
      base: { type: 'string', required: true, description: 'Target branch' },
      body: { type: 'string', required: false, description: 'Pull request description' },
      draft: { type: 'boolean', required: false, description: 'Create as draft', default: false }
    },
    requiredScopes: ['repo']
  },
  {
    id: 'merge_pull_request',
    name: 'Merge Pull Request',
    description: 'Merge a pull request',
    category: 'action',
    parameters: {
      owner: { type: 'string', required: true, description: 'Repository owner' },
      repo: { type: 'string', required: true, description: 'Repository name' },
      pull_number: { type: 'number', required: true, description: 'Pull request number' },
      commit_title: { type: 'string', required: false, description: 'Merge commit title' },
      commit_message: { type: 'string', required: false, description: 'Merge commit message' },
      merge_method: { type: 'string', required: false, description: 'Merge method', options: ['merge', 'squash', 'rebase'], default: 'merge' }
    },
    requiredScopes: ['repo']
  },
  
  // === COMMIT MANAGEMENT ===
  {
    id: 'list_commits',
    name: 'List Commits',
    description: 'List repository commits',
    category: 'both',
    parameters: {
      owner: { type: 'string', required: true, description: 'Repository owner' },
      repo: { type: 'string', required: true, description: 'Repository name' },
      sha: { type: 'string', required: false, description: 'Branch or commit SHA' },
      path: { type: 'string', required: false, description: 'File path filter' },
      author: { type: 'string', required: false, description: 'Author filter' },
      since: { type: 'string', required: false, description: 'Since date (ISO format)' },
      until: { type: 'string', required: false, description: 'Until date (ISO format)' },
      per_page: { type: 'number', required: false, description: 'Results per page', default: 30 }
    },
    requiredScopes: ['repo']
  },
  
  // === TRIGGERS ===
  {
    id: 'push_event',
    name: 'Push Event',
    description: 'Trigger when code is pushed',
    category: 'trigger',
    parameters: {
      owner: { type: 'string', required: false, description: 'Repository owner filter' },
      repo: { type: 'string', required: false, description: 'Repository name filter' },
      branch: { type: 'string', required: false, description: 'Branch filter' }
    },
    requiredScopes: ['repo']
  },
  {
    id: 'issue_opened',
    name: 'Issue Opened',
    description: 'Trigger when issue is created',
    category: 'trigger',
    parameters: {
      owner: { type: 'string', required: false, description: 'Repository owner filter' },
      repo: { type: 'string', required: false, description: 'Repository name filter' }
    },
    requiredScopes: ['repo']
  },
  {
    id: 'pull_request_opened',
    name: 'Pull Request Opened',
    description: 'Trigger when pull request is created',
    category: 'trigger',
    parameters: {
      owner: { type: 'string', required: false, description: 'Repository owner filter' },
      repo: { type: 'string', required: false, description: 'Repository name filter' }
    },
    requiredScopes: ['repo']
  }
];

// Export all function arrays
export {
  AIRTABLE_FUNCTIONS,
  DROPBOX_FUNCTIONS,
  GITHUB_FUNCTIONS
};