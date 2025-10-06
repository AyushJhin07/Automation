import { Router } from "express";
import { authenticateToken, requirePermission } from "../middleware/auth";
import { connectionService } from "../services/ConnectionService";
import { getErrorMessage } from "../types/common";
import { connectorMetadataService } from "../services/metadata/ConnectorMetadataService";

const router = Router();
const SHEET_ID_RE = /^[a-zA-Z0-9-_]+$/;

router.get(
  "/sheets/:spreadsheetId/metadata",
  authenticateToken,
  requirePermission("integration:metadata:read"),
  async (req, res) => {
    const userId = (req as any)?.user?.id;
    const organizationId = (req as any)?.organizationId;
    if (!userId) {
      return res.status(401).json({ success: false, error: "UNAUTHORIZED" });
    }

    if (!organizationId) {
      return res.status(400).json({ success: false, error: "ORGANIZATION_REQUIRED" });
    }

    const rawParam = String(req.params.spreadsheetId || "").trim();
    if (!rawParam) {
      return res.status(400).json({ success: false, error: "MISSING_SPREADSHEET_ID" });
    }

    if (!SHEET_ID_RE.test(rawParam)) {
      return res.status(400).json({ success: false, error: "INVALID_SPREADSHEET_ID" });
    }

    try {
      const { connections } = await connectionService.getUserConnections(userId, organizationId);
      const sheetsConnection = connections.find((conn) => {
        const provider = (conn.provider || "").toLowerCase();
        return provider.includes("sheet");
      });

      const credentials = sheetsConnection?.credentials || {};
      const accessToken: string | undefined =
        credentials.accessToken || credentials.token || credentials.oauthToken;

      if (!accessToken) {
        return res.status(403).json({ success: false, error: "NO_SHEETS_CONNECTION" });
      }

      const sheetName = String(req.query.sheetName || req.query.tab || "").trim() || undefined;

      const result = await connectorMetadataService.resolve("google-sheets", {
        credentials: { accessToken },
        params: {
          spreadsheetId: rawParam,
          sheetName,
        },
      });

      if (!result.success) {
        const status = result.status && result.status >= 100 ? result.status : 502;
        return res.status(status).json({
          success: false,
          error: result.error || "GOOGLE_API_ERROR",
          warnings: result.warnings,
        });
      }

      return res.json({
        success: true,
        spreadsheetId: rawParam,
        sheets: result.extras?.tabs ?? [],
        sheetName: result.extras?.sheetName ?? sheetName,
        metadata: result.metadata,
        warnings: result.warnings,
      });
    } catch (error) {
      console.error("Failed to fetch sheet metadata:", error);
      return res.status(500).json({
        success: false,
        error: getErrorMessage(error)
      });
    }
  }
);

export default router;
