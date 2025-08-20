# Google Apps Script Automation Studio

## Overview

This is a full-stack web application for showcasing and delivering Google Apps Script automation solutions. The platform serves as both a marketing site and a functional automation builder, targeting businesses looking to streamline their workflows through Google Workspace integrations. The application demonstrates various pre-built automations, provides interactive demos, and offers AI-powered workflow generation capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **React with TypeScript**: Modern React application using functional components and hooks
- **Vite Build System**: Fast development server and build tool configured for React
- **UI Framework**: Shadcn/ui components built on Radix UI primitives with Tailwind CSS
- **Design System**: Monochrome glass-morphism theme with CSS variables for consistent styling
- **Routing**: React Router for client-side navigation with dedicated pages for different sections
- **State Management**: React Query for server state and useState/useEffect for local component state

### Backend Architecture
- **Express.js Server**: Node.js backend serving both API routes and static assets
- **Middleware Pattern**: Custom logging, error handling, and request processing middleware
- **Development Integration**: Vite middleware integration for hot module replacement in development
- **Storage Interface**: Abstract storage layer with in-memory implementation (ready for database expansion)

### Data Storage Solutions
- **PostgreSQL with Drizzle ORM**: Configured for production database with Neon serverless driver
- **Schema Definition**: Shared schema files using Drizzle with Zod validation
- **Database Migrations**: Drizzle Kit for schema management and migrations
- **Development Fallback**: In-memory storage implementation for development/testing

### Component Architecture
- **Modular Component Structure**: Organized by functionality (ui, demos, ai, customizer, layout, sections)
- **Demo System**: Interactive automation demonstrations with realistic UI simulations
- **AI Components**: Workflow builder, document processor, predictive analytics, and conversational assistant
- **Graph Customizer**: Visual workflow builder with drag-and-drop node-based interface

### Key Features
- **Pre-Built Automation Catalog**: Showcases ready-to-deploy Google Apps Script solutions
- **Interactive Demos**: Realistic simulations of automation workflows in Google Workspace interfaces
- **AI-Powered Workflow Builder**: Natural language to automation script conversion
- **Visual Graph Editor**: Drag-and-drop interface for creating automation workflows
- **Script Customization**: Tools for personalizing automation scripts with custom parameters
- **Tutorial System**: Step-by-step guides for implementing automations

### External Dependencies

#### Core Frontend Libraries
- **React 18** with TypeScript for UI development
- **Vite** for build tooling and development server
- **React Query** for server state management and caching
- **React Router** for client-side routing
- **React Helmet Async** for SEO and meta tag management

#### UI and Styling
- **Tailwind CSS** for utility-first styling
- **Radix UI** for accessible component primitives
- **Shadcn/ui** for pre-built component library
- **Lucide React** for consistent iconography
- **Class Variance Authority** for component variant management

#### Backend and Database
- **Express.js** for server framework
- **Drizzle ORM** with PostgreSQL dialect
- **@neondatabase/serverless** for PostgreSQL connection
- **Drizzle Kit** for database schema management
- **Drizzle Zod** for runtime validation

#### Development Tools
- **TypeScript** for type safety across the stack
- **ESBuild** for server-side bundling
- **PostCSS** with Autoprefixer for CSS processing
- **@replit/vite-plugin-runtime-error-modal** for development error handling
- **@replit/vite-plugin-cartographer** for Replit integration

#### Google Workspace Integration
The application is designed to work with Google Apps Script and various Google Workspace APIs including Gmail, Sheets, Drive, Calendar, and Forms, though specific API libraries are loaded dynamically in the generated scripts rather than bundled with the application.