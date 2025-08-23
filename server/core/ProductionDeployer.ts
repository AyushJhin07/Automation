import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const execAsync = promisify(exec);

export interface DeploymentOptions {
  projectName?: string;
  description?: string;
  timezone?: string;
  deployAsWebApp?: boolean;
  webAppAccess?: 'MYSELF' | 'DOMAIN' | 'ANYONE' | 'ANYONE_ANONYMOUS';
  executeAs?: 'USER_ACCESSING' | 'USER_DEPLOYING';
  versionDescription?: string;
  manifestVersion?: string;
}

export interface DeploymentResult {
  success: boolean;
  deploymentId?: string;
  scriptId?: string;
  webAppUrl?: string;
  versionNumber?: number;
  logs: string[];
  error?: string;
  files?: Array<{
    name: string;
    size: number;
    uploaded: boolean;
  }>;
  manifest?: any;
}

export interface CompiledFile {
  name: string;
  content: string;
  type: 'javascript' | 'json' | 'html';
  description?: string;
}

export class ProductionDeployer {
  private tempDir: string;
  private logs: string[] = [];

  constructor() {
    this.tempDir = path.join(process.cwd(), '.temp-deployments');
  }

  /**
   * Deploy compiled workflow to Google Apps Script
   */
  public async deploy(files: CompiledFile[], options: DeploymentOptions = {}): Promise<DeploymentResult> {
    this.logs = [];
    this.log('🚀 Starting deployment process...');

    try {
      // Validate inputs
      if (!files || files.length === 0) {
        throw new Error('No files provided for deployment');
      }

      // Check clasp installation
      await this.checkClaspInstallation();

      // Create temporary project directory
      const projectDir = await this.createProjectDirectory(options.projectName || 'automation-project');

      // Write files to directory
      await this.writeFilesToDirectory(files, projectDir);

      // Initialize clasp project
      const scriptId = await this.initializeClaspProject(projectDir, options);

      // Push files to Google Apps Script
      await this.pushFiles(projectDir);

      // Deploy as web app if requested
      let deploymentResult: any = {};
      if (options.deployAsWebApp) {
        deploymentResult = await this.deployAsWebApp(projectDir, options);
      }

      // Get deployment info
      const deploymentInfo = await this.getDeploymentInfo(projectDir);

      // Cleanup temporary directory
      await this.cleanup(projectDir);

      this.log('✅ Deployment completed successfully');

      return {
        success: true,
        deploymentId: deploymentResult.deploymentId,
        scriptId: scriptId,
        webAppUrl: deploymentResult.webAppUrl,
        versionNumber: deploymentResult.versionNumber || 1,
        logs: this.logs,
        files: files.map(file => ({
          name: file.name,
          size: file.content.length,
          uploaded: true
        })),
        manifest: deploymentInfo.manifest
      };

    } catch (error) {
      this.log(`❌ Deployment failed: ${error.message}`);
      
      return {
        success: false,
        logs: this.logs,
        error: error.message || 'Deployment failed'
      };
    }
  }

  /**
   * Check if clasp is installed and authenticated
   */
  private async checkClaspInstallation(): Promise<void> {
    this.log('🔍 Checking clasp installation...');

    try {
      // Check if clasp is installed
      const { stdout: version } = await execAsync('clasp --version');
      this.log(`📦 Clasp version: ${version.trim()}`);

      // Check if user is logged in
      try {
        const { stdout: loginInfo } = await execAsync('clasp login --status');
        this.log('🔐 Clasp authentication verified');
      } catch (loginError) {
        // Try to get login status differently
        try {
          await execAsync('clasp list');
          this.log('🔐 Clasp authentication verified via project list');
        } catch (listError) {
          throw new Error('Clasp is not authenticated. Please run "clasp login" first.');
        }
      }

    } catch (error) {
      if (error.message.includes('command not found') || error.message.includes('not recognized')) {
        throw new Error('Clasp is not installed. Please install it with: npm install -g @google/clasp');
      }
      throw error;
    }
  }

  /**
   * Create temporary project directory
   */
  private async createProjectDirectory(projectName: string): Promise<string> {
    const projectId = `${projectName}-${uuidv4().substring(0, 8)}`;
    const projectDir = path.join(this.tempDir, projectId);

    this.log(`📁 Creating project directory: ${projectDir}`);

    // Ensure temp directory exists
    await fs.mkdir(this.tempDir, { recursive: true });

    // Create project directory
    await fs.mkdir(projectDir, { recursive: true });

    return projectDir;
  }

  /**
   * Write compiled files to project directory
   */
  private async writeFilesToDirectory(files: CompiledFile[], projectDir: string): Promise<void> {
    this.log(`📝 Writing ${files.length} files to project directory...`);

    for (const file of files) {
      const filePath = path.join(projectDir, file.name);
      
      // Handle different file types
      let content = file.content;
      
      if (file.name === 'appsscript.json') {
        // Ensure proper JSON formatting for manifest
        try {
          const parsed = typeof content === 'string' ? JSON.parse(content) : content;
          content = JSON.stringify(parsed, null, 2);
        } catch (e) {
          this.log(`⚠️ Warning: Invalid JSON in ${file.name}, using as-is`);
        }
      }

      await fs.writeFile(filePath, content, 'utf8');
      this.log(`✅ Written: ${file.name} (${content.length} bytes)`);
    }

    // Create appsscript.json if not provided
    const manifestPath = path.join(projectDir, 'appsscript.json');
    try {
      await fs.access(manifestPath);
    } catch (error) {
      // Create default manifest
      const defaultManifest = {
        timeZone: 'America/New_York',
        dependencies: {},
        exceptionLogging: 'STACKDRIVER',
        runtimeVersion: 'V8'
      };
      
      await fs.writeFile(manifestPath, JSON.stringify(defaultManifest, null, 2));
      this.log('📄 Created default appsscript.json');
    }
  }

  /**
   * Initialize clasp project
   */
  private async initializeClaspProject(projectDir: string, options: DeploymentOptions): Promise<string> {
    this.log('🔧 Initializing clasp project...');

    const originalCwd = process.cwd();
    
    try {
      // Change to project directory
      process.chdir(projectDir);

      // Create new Apps Script project
      const projectName = options.projectName || 'Automation Project';
      const { stdout: createOutput } = await execAsync(`clasp create --title "${projectName}" --type standalone`);
      
      this.log(`📋 Project created: ${createOutput.trim()}`);

      // Extract script ID from output or .clasp.json
      let scriptId: string;
      
      try {
        const claspConfig = await fs.readFile(path.join(projectDir, '.clasp.json'), 'utf8');
        const config = JSON.parse(claspConfig);
        scriptId = config.scriptId;
      } catch (error) {
        // Try to extract from create output
        const match = createOutput.match(/https:\/\/script\.google\.com\/d\/([a-zA-Z0-9-_]+)/);
        if (match) {
          scriptId = match[1];
        } else {
          throw new Error('Could not determine script ID from clasp output');
        }
      }

      this.log(`🆔 Script ID: ${scriptId}`);
      return scriptId;

    } finally {
      // Restore original working directory
      process.chdir(originalCwd);
    }
  }

  /**
   * Push files to Google Apps Script
   */
  private async pushFiles(projectDir: string): Promise<void> {
    this.log('⬆️ Pushing files to Google Apps Script...');

    const originalCwd = process.cwd();
    
    try {
      process.chdir(projectDir);

      // Push files
      const { stdout: pushOutput, stderr: pushError } = await execAsync('clasp push --force');
      
      if (pushError && !pushError.includes('Warning')) {
        throw new Error(`Push failed: ${pushError}`);
      }

      this.log('✅ Files pushed successfully');
      if (pushOutput) {
        this.log(`📤 Push output: ${pushOutput.trim()}`);
      }

    } finally {
      process.chdir(originalCwd);
    }
  }

  /**
   * Deploy as web app
   */
  private async deployAsWebApp(projectDir: string, options: DeploymentOptions): Promise<{
    deploymentId: string;
    webAppUrl: string;
    versionNumber: number;
  }> {
    this.log('🌐 Deploying as web app...');

    const originalCwd = process.cwd();
    
    try {
      process.chdir(projectDir);

      // Create new version first
      const versionDescription = options.versionDescription || `Deployed at ${new Date().toISOString()}`;
      const { stdout: versionOutput } = await execAsync(`clasp version "${versionDescription}"`);
      
      this.log(`📦 Version created: ${versionOutput.trim()}`);

      // Extract version number
      const versionMatch = versionOutput.match(/(\d+)/);
      const versionNumber = versionMatch ? parseInt(versionMatch[1]) : 1;

      // Deploy web app
      const access = options.webAppAccess || 'ANYONE_ANONYMOUS';
      const executeAs = options.executeAs || 'USER_DEPLOYING';
      
      const deployCommand = `clasp deploy --versionNumber ${versionNumber} --description "${versionDescription}"`;
      const { stdout: deployOutput } = await execAsync(deployCommand);

      this.log(`🚀 Web app deployed: ${deployOutput.trim()}`);

      // Extract deployment ID and URL
      const deploymentIdMatch = deployOutput.match(/- ([A-Za-z0-9_-]+) @/);
      const urlMatch = deployOutput.match(/(https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec)/);

      if (!deploymentIdMatch) {
        throw new Error('Could not extract deployment ID from clasp output');
      }

      const deploymentId = deploymentIdMatch[1];
      const webAppUrl = urlMatch ? urlMatch[1] : '';

      return {
        deploymentId,
        webAppUrl,
        versionNumber
      };

    } finally {
      process.chdir(originalCwd);
    }
  }

  /**
   * Get deployment information
   */
  private async getDeploymentInfo(projectDir: string): Promise<{
    manifest: any;
    deployments: any[];
  }> {
    const originalCwd = process.cwd();
    
    try {
      process.chdir(projectDir);

      // Get manifest
      let manifest = {};
      try {
        const manifestContent = await fs.readFile('appsscript.json', 'utf8');
        manifest = JSON.parse(manifestContent);
      } catch (error) {
        this.log('⚠️ Could not read manifest file');
      }

      // Get deployments
      let deployments = [];
      try {
        const { stdout: deploymentsOutput } = await execAsync('clasp deployments');
        // Parse deployments output (this would need more sophisticated parsing)
        deployments = [{ info: deploymentsOutput.trim() }];
      } catch (error) {
        this.log('⚠️ Could not get deployment information');
      }

      return { manifest, deployments };

    } finally {
      process.chdir(originalCwd);
    }
  }

  /**
   * Cleanup temporary directory
   */
  private async cleanup(projectDir: string): Promise<void> {
    try {
      this.log('🧹 Cleaning up temporary files...');
      await fs.rm(projectDir, { recursive: true, force: true });
      this.log('✅ Cleanup completed');
    } catch (error) {
      this.log(`⚠️ Cleanup warning: ${error.message}`);
    }
  }

  /**
   * Get deployment status for existing script
   */
  public async getDeploymentStatus(scriptId: string): Promise<{
    exists: boolean;
    deployments: Array<{
      deploymentId: string;
      description: string;
      webAppUrl?: string;
      versionNumber?: number;
    }>;
  }> {
    try {
      // This would require clasp to be configured for the specific script
      // For now, return a basic response
      return {
        exists: true,
        deployments: []
      };
    } catch (error) {
      return {
        exists: false,
        deployments: []
      };
    }
  }

  /**
   * Generate manual deployment instructions
   */
  public generateManualDeploymentInstructions(files: CompiledFile[], options: DeploymentOptions = {}): string {
    const instructions = `
# Manual Deployment Instructions

## Prerequisites
1. Install Google Apps Script CLI: \`npm install -g @google/clasp\`
2. Login to clasp: \`clasp login\`
3. Enable Apps Script API: https://script.google.com/home/usersettings

## Step-by-Step Deployment

### 1. Create New Project
\`\`\`bash
mkdir ${options.projectName || 'my-automation'}
cd ${options.projectName || 'my-automation'}
clasp create --title "${options.projectName || 'My Automation'}" --type standalone
\`\`\`

### 2. Copy Files
Create the following files in your project directory:

${files.map(file => `
**${file.name}**
\`\`\`${file.type === 'javascript' ? 'javascript' : file.type === 'json' ? 'json' : 'text'}
${file.content}
\`\`\`
`).join('\n')}

### 3. Push to Google Apps Script
\`\`\`bash
clasp push
\`\`\`

### 4. Deploy as Web App (Optional)
\`\`\`bash
clasp version "Initial deployment"
clasp deploy --versionNumber 1 --description "Initial deployment"
\`\`\`

### 5. Set Up Triggers
1. Open your script in the Apps Script editor
2. Run the \`installTriggers()\` function once
3. Authorize the required permissions

### 6. Configure Properties
In the Apps Script editor, go to Project Settings > Script Properties and add any required API keys or configuration values.

## Testing
Run \`executeWorkflow({})\` in the Apps Script editor to test your automation.

## Monitoring
- View execution logs in the Apps Script editor
- Set up email notifications for errors
- Monitor quota usage in Google Cloud Console
`;

    return instructions;
  }

  /**
   * Validate deployment prerequisites
   */
  public async validatePrerequisites(): Promise<{
    valid: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    try {
      // Check clasp installation
      await execAsync('clasp --version');
    } catch (error) {
      issues.push('Clasp is not installed');
      recommendations.push('Install clasp: npm install -g @google/clasp');
    }

    try {
      // Check clasp authentication
      await execAsync('clasp login --status');
    } catch (error) {
      issues.push('Clasp is not authenticated');
      recommendations.push('Login to clasp: clasp login');
    }

    // Check Node.js version
    try {
      const { stdout: nodeVersion } = await execAsync('node --version');
      const version = nodeVersion.trim().replace('v', '');
      const majorVersion = parseInt(version.split('.')[0]);
      
      if (majorVersion < 14) {
        issues.push(`Node.js version ${version} is too old`);
        recommendations.push('Upgrade to Node.js 14 or higher');
      }
    } catch (error) {
      issues.push('Node.js is not installed');
      recommendations.push('Install Node.js from https://nodejs.org');
    }

    return {
      valid: issues.length === 0,
      issues,
      recommendations
    };
  }

  /**
   * Estimate deployment time and resources
   */
  public estimateDeployment(files: CompiledFile[]): {
    estimatedTimeMinutes: number;
    totalSizeKB: number;
    fileCount: number;
    complexity: 'low' | 'medium' | 'high';
  } {
    const totalSize = files.reduce((sum, file) => sum + file.content.length, 0);
    const totalSizeKB = Math.round(totalSize / 1024);
    
    let complexity: 'low' | 'medium' | 'high' = 'low';
    let estimatedTimeMinutes = 2; // Base time

    // Determine complexity based on file count and size
    if (files.length > 10 || totalSizeKB > 500) {
      complexity = 'high';
      estimatedTimeMinutes = 8;
    } else if (files.length > 5 || totalSizeKB > 100) {
      complexity = 'medium';
      estimatedTimeMinutes = 5;
    }

    // Check for complex features
    const hasWebhooks = files.some(f => f.content.includes('doPost') || f.content.includes('doGet'));
    const hasExternalAPIs = files.some(f => f.content.includes('UrlFetchApp'));
    const hasTriggers = files.some(f => f.content.includes('ScriptApp.newTrigger'));

    if (hasWebhooks || hasExternalAPIs || hasTriggers) {
      estimatedTimeMinutes += 2;
      if (complexity === 'low') complexity = 'medium';
    }

    return {
      estimatedTimeMinutes,
      totalSizeKB,
      fileCount: files.length,
      complexity
    };
  }

  /**
   * Log deployment messages
   */
  private log(message: string): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    this.logs.push(logMessage);
    console.log(logMessage);
  }
}

export const productionDeployer = new ProductionDeployer();