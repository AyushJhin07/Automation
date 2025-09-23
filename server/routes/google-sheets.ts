import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import { connectionService } from "../services/ConnectionService";
import { getErrorMessage } from "../types/common";

const router = Router();
const SHEET_ID_RE = /^[a-zA-Z0-9-_]+$/;

router.get(
  "/sheets/:spreadsheetId/metadata",
  authenticateToken,
  async (req, res) => {
    const userId = (req as any)?.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "UNAUTHORIZED" });
    }

    const rawParam = String(req.params.spreadsheetId || "").trim();
    if (!rawParam) {
      return res.status(400).json({ success: false, error: "MISSING_SPREADSHEET_ID" });
    }

    if (!SHEET_ID_RE.test(rawParam)) {
      return res.status(400).json({ success: false, error: "INVALID_SPREADSHEET_ID" });
    }

    try {
      const connections = await connectionService.getUserConnections(userId);
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

      const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        rawParam
      )}?fields=sheets.properties.title`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        }
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        return res.status(response.status).json({
          success: false,
          error: "GOOGLE_API_ERROR",
          status: response.status,
          message: text ? text.slice(0, 2000) : undefined
        });
      }

      const json = await response.json().catch(() => ({}));
      const sheets = Array.isArray(json?.sheets)
        ? json.sheets
            .map((sheet: any) => sheet?.properties?.title)
            .filter((title: any) => typeof title === "string" && title.trim().length > 0)
            .map((title: string) => title.trim())
        : [];

      return res.json({
        success: true,
        spreadsheetId: rawParam,
        sheets
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
