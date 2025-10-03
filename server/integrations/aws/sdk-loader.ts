const moduleWarnings = new Set<string>();

const isModuleNotFoundError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }
  return 'code' in error && (error as { code?: string }).code === 'ERR_MODULE_NOT_FOUND';
};

const resolveModule = async <TModule>(
  specifier: string,
  fallback: () => Promise<TModule>,
  warning: string
): Promise<TModule> => {
  return import(specifier).catch(async (error: unknown) => {
    if (!isModuleNotFoundError(error)) {
      throw error;
    }
    if (!moduleWarnings.has(specifier)) {
      console.warn(warning);
      moduleWarnings.add(specifier);
    }
    return fallback();
  }) as Promise<TModule>;
};

export const loadCloudFormationSdk = (): Promise<typeof import('./stubs/cloudformation.js')> =>
  resolveModule(
    '@aws-sdk/client-cloudformation',
    () => import('./stubs/cloudformation.js'),
    '[aws-sdk] Falling back to internal stub for @aws-sdk/client-cloudformation. Install the official AWS SDK client to enable live CloudFormation calls.'
  );

export const loadCodePipelineSdk = (): Promise<typeof import('./stubs/codepipeline.js')> =>
  resolveModule(
    '@aws-sdk/client-codepipeline',
    () => import('./stubs/codepipeline.js'),
    '[aws-sdk] Falling back to internal stub for @aws-sdk/client-codepipeline. Install the official AWS SDK client to enable live CodePipeline calls.'
  );
