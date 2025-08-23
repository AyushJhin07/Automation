import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

export interface DeploymentOptions {
  projectName: string;
  description?: string;
  deployAsWebApp?: boolean;
  executeAs?: 'USER_ACCESSING' | 'USER_DEPLOYING';
  whoHasAccess?: 'ANYONE' | 'ANYONE_ANONYMOUS' | 'DOMAIN' | 'MYSELF';
}

export interface DeploymentResult {
  success: boolean;
  deploymentId?: string;
  webAppUrl?: string;
  scriptId?: string;
  error?: string;
  logs: string[];
}

export interface CompiledFile {
  name: string;
  content: string;
  type: string;
}

export class GoogleAppsScriptDeployer {
  private tempDir: string;
  private logs: string[] = [];

  constructor() {
    this.tempDir = path.join(process.cwd(), 'temp_deployments');
  }

  /**
   * Deploy compiled Google Apps Script files
   */
  public async deploy(
    files: CompiledFile[], 
    options: DeploymentOptions
  ): Promise<DeploymentResult> {
    this.logs = [];
    
    try {
      this.log('🚀 Starting Google Apps Script deployment...');
      
      // 1. Check if clasp is installed
      await this.checkClaspInstallation();
      
      // 2. Create temporary project directory
      const projectDir = await this.createProjectDirectory(options.projectName);
      
      // 3. Write files to directory
      await this.writeFilesToDirectory(files, projectDir);
      
      // 4. Initialize clasp project
      const scriptId = await this.initializeClaspProject(projectDir, options);
      
      // 5. Push files to Google Apps Script
      await this.pushFiles(projectDir);
      
      // 6. Deploy as web app if requested
      let webAppUrl: string | undefined;
      let deploymentId: string | undefined;
      
      if (options.deployAsWebApp) {
        const deployment = await this.deployAsWebApp(projectDir, options);
        webAppUrl = deployment.webAppUrl;
        deploymentId = deployment.deploymentId;
      }
      
      // 7. Cleanup temporary files
      await this.cleanup(projectDir);
      
      this.log('✅ Deployment completed successfully!');
      
      return {
        success: true,
        deploymentId,
        webAppUrl,
        scriptId,
        logs: this.logs
      };
      
    } catch (error) {
      this.log(`❌ Deployment failed: ${error.message}`);
      
      return {
        success: false,
        error: error.message,
        logs: this.logs
      };
    }
  }

  /**
   * Check if clasp is installed and authenticated
   */
  private async checkClaspInstallation(): Promise<void> {
    try {
      // Check if clasp is installed
      await execAsync('clasp --version');
      this.log('✅ clasp is installed');
      
      // Check if user is logged in
      const { stdout } = await execAsync('clasp login --status');
      if (stdout.includes('not logged in')) {
        throw new Error('Please run "clasp login" to authenticate with Google Apps Script');
      }
      
      this.log('✅ clasp authentication verified');
      
    } catch (error) {
      if (error.message.includes('clasp: command not found')) {
        throw new Error('clasp is not installed. Please install with: npm install -g @google/clasp');
      }
      throw error;
    }
  }

  /**
   * Create temporary project directory
   */
  private async createProjectDirectory(projectName: string): Promise<string> {
    const sanitizedName = projectName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const timestamp = Date.now();
    const projectDir = path.join(this.tempDir, `${sanitizedName}_${timestamp}`);
    
    await fs.mkdir(projectDir, { recursive: true });
    this.log(`📁 Created project directory: ${projectDir}`);
    
    return projectDir;
  }

  /**
   * Write compiled files to project directory
   */
  private async writeFilesToDirectory(files: CompiledFile[], projectDir: string): Promise<void> {
    this.log(`📝 Writing ${files.length} files to project directory...`);
    
    for (const file of files) {
      const filePath = path.join(projectDir, file.name);
      await fs.writeFile(filePath, file.content, 'utf8');
      this.log(`  ✅ ${file.name} (${file.content.length} bytes)`);
    }
  }

  /**
   * Initialize clasp project
   */
  private async initializeClaspProject(projectDir: string, options: DeploymentOptions): Promise<string> {
    this.log('🔧 Initializing clasp project...');
    
    // Create .clasp.json configuration
    const claspConfig = {
      scriptId: '', // Will be filled after creation
      rootDir: projectDir
    };
    
    // Change to project directory and create new Apps Script project
    const { stdout } = await execAsync(`cd "${projectDir}" && clasp create --title "${options.projectName}" --type standalone`);
    
    // Extract script ID from output
    const scriptIdMatch = stdout.match(/Created new Google Apps Script: https:\/\/script\.google\.com\/d\/([a-zA-Z0-9-_]+)/);
    if (!scriptIdMatch) {
      throw new Error('Failed to extract script ID from clasp create output');
    }
    
    const scriptId = scriptIdMatch[1];
    claspConfig.scriptId = scriptId;
    
    // Write .clasp.json file
    await fs.writeFile(
      path.join(projectDir, '.clasp.json'),
      JSON.stringify(claspConfig, null, 2)
    );
    
    this.log(`✅ Created Apps Script project: ${scriptId}`);
    return scriptId;
  }

  /**
   * Push files to Google Apps Script
   */
  private async pushFiles(projectDir: string): Promise<void> {
    this.log('📤 Pushing files to Google Apps Script...');
    
    const { stdout, stderr } = await execAsync(`cd "${projectDir}" && clasp push --force`);
    
    if (stderr && !stderr.includes('Warning')) {
      throw new Error(`Failed to push files: ${stderr}`);
    }
    
    this.log('✅ Files pushed successfully');
    this.log(`   Output: ${stdout.trim()}`);
  }

  /**
   * Deploy as web application
   */
  private async deployAsWebApp(projectDir: string, options: DeploymentOptions): Promise<{
    deploymentId: string;
    webAppUrl: string;
  }> {
    this.log('🌐 Deploying as web application...');
    
    const deployCommand = [
      'clasp deploy',
      '--description', `"${options.description || 'Automated deployment'}"`,
      '--deploymentId', 'HEAD' // Use HEAD for new deployment
    ].join(' ');
    
    const { stdout } = await execAsync(`cd "${projectDir}" && ${deployCommand}`);
    
    // Extract deployment info from output
    const deploymentIdMatch = stdout.match(/- ([a-zA-Z0-9-_]+) @HEAD/);
    const webAppUrlMatch = stdout.match(/- (https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9-_]+\/exec)/);
    
    if (!deploymentIdMatch || !webAppUrlMatch) {
      throw new Error('Failed to extract deployment information from clasp deploy output');
    }
    
    const deploymentId = deploymentIdMatch[1];
    const webAppUrl = webAppUrlMatch[1];
    
    this.log(`✅ Web app deployed successfully`);
    this.log(`   Deployment ID: ${deploymentId}`);
    this.log(`   Web App URL: ${webAppUrl}`);
    
    return { deploymentId, webAppUrl };
  }

  /**
   * Cleanup temporary files
   */
  private async cleanup(projectDir: string): Promise<void> {
    try {
      await fs.rm(projectDir, { recursive: true, force: true });
      this.log('🧹 Cleaned up temporary files');
    } catch (error) {
      this.log(`⚠️ Failed to cleanup temporary files: ${error.message}`);
    }
  }

  /**
   * Get deployment status
   */
  public async getDeploymentStatus(scriptId: string): Promise<{
    exists: boolean;
    deployments: Array<{
      deploymentId: string;
      description: string;
      webAppUrl?: string;
    }>;
  }> {
    try {
      // This would require Apps Script API integration
      // For now, return basic status
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
   * Generate deployment instructions for manual deployment
   */
  public generateManualDeploymentInstructions(
    files: CompiledFile[],
    options: DeploymentOptions
  ): string {
    return `# Manual Deployment Instructions for ${options.projectName}

## Prerequisites
1. Install clasp: \`npm install -g @google/clasp\`
2. Login to Google: \`clasp login\`

## Deployment Steps

### 1. Create New Project
\`\`\`bash
clasp create --title "${options.projectName}" --type standalone
\`\`\`

### 2. Add Files
Create the following files in your project directory:

${files.map(file => `
**${file.name}**
\`\`\`${file.type === 'js' ? 'javascript' : file.type}
${file.content}
\`\`\`
`).join('\n')}

### 3. Push to Google Apps Script
\`\`\`bash
clasp push
\`\`\`

### 4. Deploy (Optional)
${options.deployAsWebApp ? `
For web app deployment:
\`\`\`bash
clasp deploy --description "Initial deployment"
\`\`\`
` : `
For trigger-based automation:
1. Open the script in Apps Script editor
2. Run the \`setupTriggers()\` function once
3. Authorize the required permissions
`}

### 5. Test
\`\`\`bash
clasp run runWorkflow
\`\`\`

## Troubleshooting
- Ensure all OAuth scopes are authorized
- Check execution logs in Apps Script editor
- Verify trigger setup if using time-based triggers

Generated: ${new Date().toISOString()}`;
  }

  private log(message: string): void {
    console.log(message);
    this.logs.push(message);
  }
}

// Export singleton instance
export const googleAppsScriptDeployer = new GoogleAppsScriptDeployer();