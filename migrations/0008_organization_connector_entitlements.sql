CREATE TABLE IF NOT EXISTS organization_connector_entitlements (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connector_id TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  enabled_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, connector_id)
);

CREATE INDEX IF NOT EXISTS org_connector_entitlements_org_idx
  ON organization_connector_entitlements (organization_id);
CREATE INDEX IF NOT EXISTS org_connector_entitlements_connector_idx
  ON organization_connector_entitlements (connector_id);
CREATE INDEX IF NOT EXISTS org_connector_entitlements_enabled_idx
  ON organization_connector_entitlements (is_enabled);

CREATE TABLE IF NOT EXISTS organization_connector_entitlement_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connector_id TEXT NOT NULL,
  action TEXT NOT NULL,
  performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS org_connector_audit_org_idx
  ON organization_connector_entitlement_audit (organization_id);
CREATE INDEX IF NOT EXISTS org_connector_audit_connector_idx
  ON organization_connector_entitlement_audit (connector_id);
CREATE INDEX IF NOT EXISTS org_connector_audit_action_idx
  ON organization_connector_entitlement_audit (action);
