export type ActionRuntimeOverride = {
  /**
   * Default runtimes to apply when the manifest omits the field.
   * Set when a connector defaults to a non-Node runtime (for example Apps Script).
   */
  runtimes?: string[];
  /**
   * Use this to seed a bespoke fallback outline when definitions omit one.
   * The seeding scripts clone the value, so feel free to include nested metadata.
   */
  fallback?: unknown;
};

export type TriggerRuntimeOverride = ActionRuntimeOverride & {
  /**
   * Overrides the default dedupe payload for triggers when the manifest does not supply one.
   */
  dedupe?: Record<string, any>;
};

export type ConnectorRuntimeOverride = {
  actions?: {
    /**
     * Defaults applied to every action inside the connector when a field is missing.
     */
    all?: ActionRuntimeOverride;
    /**
     * Overrides applied to a specific action id. Keys should match the action's `id` property.
     */
    byId?: Record<string, ActionRuntimeOverride>;
  };
  triggers?: {
    /**
     * Defaults applied to each trigger when a field is absent.
     */
    all?: TriggerRuntimeOverride;
    /**
     * Overrides applied to a specific trigger id. Keys should match the trigger's `id` property.
     */
    byId?: Record<string, TriggerRuntimeOverride>;
  };
};

/**
 * Centralised overrides for runtime defaults.
 *
 * When a connector requires a non-Node runtime (for example, Apps Script or Python)
 * or bespoke fallback scaffolding, add an entry here instead of hand-editing every manifest.
 * The seeding scripts only fill missing fields, so explicit values in the manifest always win.
 */
export const CONNECTOR_RUNTIME_OVERRIDES: Record<string, ConnectorRuntimeOverride> = {
  // Example:
  // 'hellosign': {
  //   actions: {
  //     all: { runtimes: ['appsScript'] },
  //   },
  //   triggers: {
  //     all: { runtimes: ['appsScript'], dedupe: { strategy: 'id', path: 'id' } },
  //   },
  // },
};
