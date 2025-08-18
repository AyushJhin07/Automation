# Apps Script Automation Studio

## Project Overview
A comprehensive Google Apps Script automation platform that helps businesses automate their Google Workspace workflows. The platform includes pre-built automation templates, a visual workflow builder, and AI-enhanced customization features.

## Architecture
- **Frontend**: React with TypeScript, Wouter routing, Tailwind CSS, shadcn/ui components
- **Backend**: Express.js with TypeScript  
- **Storage**: In-memory storage for development
- **Workflow Engine**: Custom visual node-based builder using ReactFlow

## Key Features
1. **Pre-Built Automations**: 6 ready-to-use Google Apps Script templates
2. **Visual Workflow Builder**: Node-based graph interface for connecting Google Apps
3. **AI Enhancement**: Smart suggestions and configuration assistance
4. **Code Generation**: Automatic Google Apps Script code generation
5. **Interactive Demos**: Live demonstrations of automation workflows

## Recent Changes
- **2025-01-18**: Successfully migrated from Lovable to Replit
- **2025-01-18**: Converted React Router to Wouter for Replit compatibility
- **2025-01-18**: Implemented visual workflow builder with ReactFlow
- **2025-01-18**: Added comprehensive Google Apps action definitions (Gmail, Sheets, Drive, Docs)

## User Preferences
- Prefers node-based visual workflow builders over traditional form UIs
- Wants backend logic implementation, not just UI mockups
- Requires comprehensive action lists for all Google Apps integrations
- Values practical, testable automation solutions

## Technical Stack
- React 18 with TypeScript
- Wouter for routing (Replit-compatible)
- Express.js server
- ReactFlow for visual workflow building
- Tailwind CSS + shadcn/ui for styling
- Google Apps Script code generation

## Development Notes
- Uses Replit's full-stack JavaScript template
- Server runs on port 5000 (Express + Vite)
- Workflow builder generates executable Google Apps Script code
- All routing uses Wouter instead of React Router for Replit compatibility