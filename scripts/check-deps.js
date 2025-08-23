#!/usr/bin/env node

/**
 * Dependency Check Script
 * Validates all imports and prevents module resolution issues
 */

import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Colors for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

async function findTSFiles(dir) {
  const files = [];
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        files.push(...await findTSFiles(fullPath));
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.log(`${colors.yellow}Warning: Could not read directory ${dir}${colors.reset}`);
  }
  
  return files;
}

async function extractImports(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
    const imports = [];
    let match;
    
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    
    return imports;
  } catch (error) {
    console.log(`${colors.yellow}Warning: Could not read file ${filePath}${colors.reset}`);
    return [];
  }
}

function isExternalPackage(importPath) {
  // Exclude relative paths, absolute paths, Node.js built-ins, and TypeScript path aliases
  if (importPath.startsWith('.') || importPath.startsWith('/') || importPath.startsWith('node:')) {
    return false;
  }
  
  // Exclude common TypeScript path aliases
  if (importPath.startsWith('@/') || importPath.startsWith('@shared/')) {
    return false;
  }
  
  return true;
}

async function checkPackageExists(packageName) {
  try {
    require.resolve(packageName);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log(`${colors.blue}🔍 Checking all dependencies and imports...${colors.reset}\n`);
  
  const serverFiles = await findTSFiles('./server');
  const clientFiles = await findTSFiles('./client/src');
  const sharedFiles = await findTSFiles('./shared');
  
  const allFiles = [...serverFiles, ...clientFiles, ...sharedFiles];
  console.log(`Found ${allFiles.length} TypeScript files to check\n`);
  
  const allImports = new Set();
  const fileImports = new Map();
  
  // Extract all imports
  for (const file of allFiles) {
    const imports = await extractImports(file);
    fileImports.set(file, imports);
    
    imports.forEach(imp => {
      if (isExternalPackage(imp)) {
        const packageName = imp.split('/')[0];
        if (packageName.startsWith('@')) {
          // Scoped package
          allImports.add(imp.split('/').slice(0, 2).join('/'));
        } else {
          allImports.add(packageName);
        }
      }
    });
  }
  
  console.log(`${colors.blue}📦 Checking ${allImports.size} external packages...${colors.reset}`);
  
  const missingPackages = [];
  const checkedPackages = [];
  
  for (const packageName of allImports) {
    const exists = await checkPackageExists(packageName);
    if (exists) {
      checkedPackages.push(packageName);
      console.log(`${colors.green}✅ ${packageName}${colors.reset}`);
    } else {
      missingPackages.push(packageName);
      console.log(`${colors.red}❌ ${packageName} - NOT FOUND${colors.reset}`);
    }
  }
  
  console.log(`\n${colors.blue}📊 Summary:${colors.reset}`);
  console.log(`${colors.green}✅ Found: ${checkedPackages.length}${colors.reset}`);
  console.log(`${colors.red}❌ Missing: ${missingPackages.length}${colors.reset}`);
  
  if (missingPackages.length > 0) {
    console.log(`\n${colors.red}🚨 Missing packages detected!${colors.reset}`);
    console.log(`Run: npm install ${missingPackages.join(' ')}`);
    
    // Show which files use missing packages
    console.log(`\n${colors.yellow}📂 Files using missing packages:${colors.reset}`);
    for (const [file, imports] of fileImports) {
      const missingInFile = imports.filter(imp => {
        const packageName = imp.split('/')[0];
        const fullPackageName = packageName.startsWith('@') ? 
          imp.split('/').slice(0, 2).join('/') : packageName;
        return missingPackages.includes(fullPackageName);
      });
      
      if (missingInFile.length > 0) {
        console.log(`  ${file}: ${missingInFile.join(', ')}`);
      }
    }
    
    process.exit(1);
  } else {
    console.log(`\n${colors.green}🎉 All dependencies are properly installed!${colors.reset}`);
  }
}

main().catch(error => {
  console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
  process.exit(1);
});