import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { registerGoogleAppsRoutes } from "./googleAppsAPI";

export async function registerRoutes(app: Express): Promise<Server> {
  // Google Apps Script automation routes
  registerGoogleAppsRoutes(app);

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  });

  // Automation management endpoints
  app.get('/api/automations', (req, res) => {
    // TODO: Get saved automations from storage
    res.json({ automations: [] });
  });

  app.post('/api/automations', (req, res) => {
    // TODO: Save automation to storage
    const { name, nodes, edges } = req.body;
    res.json({ success: true, id: Date.now().toString() });
  });

  const httpServer = createServer(app);

  return httpServer;
}
