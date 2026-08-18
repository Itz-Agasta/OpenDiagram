export type CatalogModel = { id: string; label: string };

export type CatalogProvider = {
  id: string;
  label: string;
  docsUrl: string;
  keyPlaceholder: string;
  models: CatalogModel[];
};

export type ConnectedProvider = {
  id: string;
  provider: string;
  modelId: string;
  keyLast4: string;
  isDefault: boolean;
  createdAt: string;
};

export type AiSettings = {
  encryptionReady: boolean;
  catalog: CatalogProvider[];
  providers: ConnectedProvider[];
};

export type ProviderModelOption = {
  id: string;
  label: string;
  providerId: string;
  providerLabel: string;
  modelId: string;
  modelLabel: string;
  isDefault: boolean;
};
