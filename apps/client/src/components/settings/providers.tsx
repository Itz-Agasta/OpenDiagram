import { useEffect, useState } from "react";
import { Check, KeyRound, Loader2, Star, Trash2 } from "lucide-react";
import {
  useKumoToastManager,
  Dialog,
  DialogClose,
  DialogTitle,
  DialogDescription,
} from "@cloudflare/kumo";
import {
  connectProvider,
  disconnectProvider,
  getAiSettings,
  updateProvider,
  isRecommendedModel,
} from "#/lib/api/settings-client";
import type { AiSettings, CatalogProvider, ConnectedProvider } from "#/lib/types";
import { CustomButton, HeroButton } from "#/components/ui/button";

const PROVIDER_ICONS: Record<string, string> = {
  openai: "/brand/favicons/chatgpt-icon.png",
  anthropic: "/brand/favicons/claude-icon.png",
  google: "/brand/favicons/gemini-icon.png",
  openrouter: "/brand/favicons/openrouter-icon.png",
};

export function Providers() {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<CatalogProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const data = await getAiSettings();
      setSettings(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Settings.");
    }
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-3 font-geist">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 w-full rounded-lg bg-gray-100 animate-pulse border border-gray-200/50"
          />
        ))}
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="rounded-lg border border-gray-200/80 bg-white p-6 text-center text-sm text-gray-500 font-geist">
        <p>{error ?? "Couldn't load Settings."}</p>
        <CustomButton className="mt-3 font-geist" text="Retry" onClick={() => void refresh()} />
      </div>
    );
  }

  const connectedByProvider = new Map<string, ConnectedProvider>();
  for (const p of settings.providers) {
    if (!connectedByProvider.has(p.provider)) connectedByProvider.set(p.provider, p);
  }

  return (
    <div className="space-y-4 font-geist">
      {!settings.encryptionReady && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
          BYOK isn&apos;t enabled on this server yet. Set <code>BYOK_ENCRYPTION_KEY</code> to let
          users connect their own keys.
        </div>
      )}

      <div className="space-y-3">
        {settings.catalog.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            connected={connectedByProvider.get(provider.id) ?? null}
            disabled={!settings.encryptionReady}
            onConnect={() => setConnecting(provider)}
            onChanged={refresh}
          />
        ))}
      </div>

      {connecting && (
        <ConnectDialog
          key={connecting.id}
          provider={connecting}
          connected={connectedByProvider.get(connecting.id) ?? null}
          onClose={() => setConnecting(null)}
          onConnected={refresh}
        />
      )}
    </div>
  );
}

function ProviderIcon({ providerId, label }: { providerId: string; label: string }) {
  const src = PROVIDER_ICONS[providerId];
  if (!src) {
    return (
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-gray-100 text-sm font-semibold text-gray-600 border border-gray-200/50">
        {label.charAt(0)}
      </div>
    );
  }
  return (
    <div className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-50 border border-gray-200/50">
      <img src={src} alt="" width={28} height={28} className="size-7 object-contain" />
    </div>
  );
}

function ProviderCard({
  provider,
  connected,
  disabled,
  onConnect,
  onChanged,
}: {
  provider: CatalogProvider;
  connected: ConnectedProvider | null;
  disabled: boolean;
  onConnect: () => void;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const toastManager = useKumoToastManager();

  async function run(action: () => Promise<void>, successMessage?: string) {
    setBusy(true);
    try {
      await action();
      await onChanged();
      if (successMessage) {
        toastManager.add({
          title: "Success",
          description: successMessage,
          variant: "success",
        });
      }
    } catch (error) {
      toastManager.add({
        title: "Error",
        description: error instanceof Error ? error.message : "Something went wrong.",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-200/80 bg-white p-4 sm:flex-row sm:items-center sm:justify-between font-geist">
      <div className="flex items-center gap-3">
        <ProviderIcon providerId={provider.id} label={provider.label} />
        <div>
          <div className="flex items-center gap-2 font-semibold text-gray-900 body-font">
            {provider.label}
            {connected?.isDefault && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs text-blue-600 font-medium">
                <Check className="size-3" /> Default
              </span>
            )}
          </div>
          {connected ? (
            <div className="text-xs text-gray-500 mt-1">
              {connected.modelId} · key ••••{connected.keyLast4}
            </div>
          ) : (
            <a
              href={provider.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-gray-400 underline decoration-gray-300 underline-offset-2 hover:text-gray-600 transition"
            >
              Get an API key
            </a>
          )}
        </div>
      </div>

      {connected ? (
        <div className="flex items-center gap-2">
          <select
            value={connected.modelId}
            disabled={busy}
            onChange={(e) =>
              void run(
                () => updateProvider(connected.id, { modelId: e.target.value }),
                "Model updated.",
              )
            }
            className="h-[30px] w-[180px] px-2.5 border border-gray-200 rounded-lg text-xs bg-white outline-none focus:border-blue-500 cursor-pointer disabled:bg-gray-50 disabled:cursor-not-allowed text-gray-800 font-medium"
          >
            {provider.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} {isRecommendedModel(m.id, m.label) ? "★" : ""}
              </option>
            ))}
          </select>
          {!connected.isDefault && (
            <button
              disabled={busy}
              onClick={() =>
                void run(
                  () => updateProvider(connected.id, { makeDefault: true }),
                  "Set as default.",
                )
              }
              title="Make default"
              className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500 hover:text-gray-900 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center h-[30px] w-[30px]"
            >
              <Star className="size-4" />
            </button>
          )}
          <button
            disabled={disabled || busy}
            onClick={onConnect}
            title="Replace API key"
            className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500 hover:text-gray-900 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center h-[30px] w-[30px]"
          >
            <KeyRound className="size-4" />
          </button>
          <button
            disabled={busy}
            onClick={() => void run(() => disconnectProvider(connected.id), "Disconnected.")}
            title="Disconnect"
            className="p-1.5 border border-gray-200 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center h-[30px] w-[30px]"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          </button>
        </div>
      ) : (
        <HeroButton
          text="Connect"
          color="blue"
          disabled={disabled}
          onClick={onConnect}
          className="h-8 py-0 text-xs shadow-none"
        />
      )}
    </div>
  );
}

function ConnectDialog({
  provider,
  connected,
  onClose,
  onConnected,
}: {
  provider: CatalogProvider;
  connected: ConnectedProvider | null;
  onClose: () => void;
  onConnected: () => Promise<void>;
}) {
  const [apiKey, setApiKey] = useState("");
  const [modelId, setModelId] = useState(
    (provider.models.some((m) => m.id === connected?.modelId)
      ? connected?.modelId
      : provider.models[0]?.id) ?? "",
  );
  const [saving, setSaving] = useState(false);
  const toastManager = useKumoToastManager();

  async function save() {
    setSaving(true);
    try {
      await connectProvider({ provider: provider.id, apiKey: apiKey.trim(), modelId });
      toastManager.add({
        title: "Success",
        description: connected ? `${provider.label} key replaced.` : `${provider.label} connected.`,
        variant: "success",
      });
      await onConnected();
      onClose();
    } catch (error) {
      toastManager.add({
        title: "Error",
        description: error instanceof Error ? error.message : "Could not connect.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root open={true} onOpenChange={(open) => !open && onClose()}>
      <Dialog size="base">
        <div className="p-6 flex flex-col gap-4 font-geist">
          <DialogTitle className="text-base font-semibold text-gray-900 flex items-center gap-2.5">
            <ProviderIcon providerId={provider.id} label={provider.label} />
            {connected ? `Replace ${provider.label} key` : `Connect ${provider.label}`}
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-500 leading-normal">
            {connected
              ? `Replaces the key ending ${connected.keyLast4}. The new one is validated first, so a bad key leaves the old one in place.`
              : "Your key is validated, then encrypted before it's stored. It's never shown again."}
          </DialogDescription>

          <div className="space-y-4 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-500" htmlFor="byok-api-key">
                API key
              </label>
              <input
                id="byok-api-key"
                type="password"
                autoComplete="off"
                placeholder={provider.keyPlaceholder}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500 transition bg-white"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-500" htmlFor="byok-model">
                Model
              </label>
              <select
                id="byok-model"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className="h-[38px] px-3 border border-gray-200 rounded-lg text-sm bg-white outline-none focus:border-blue-500 cursor-pointer text-gray-800"
              >
                {provider.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} {isRecommendedModel(m.id, m.label) ? "★" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <DialogClose render={<CustomButton text="Cancel" className="h-8 font-geist" />} />
            <HeroButton
              text={
                saving
                  ? connected
                    ? "Validating…"
                    : "Connecting…"
                  : connected
                    ? "Validate & replace"
                    : "Validate & connect"
              }
              color="blue"
              onClick={save}
              disabled={saving || apiKey.trim().length < 8}
              className="h-8 py-0 text-xs shadow-none font-geist flex items-center gap-1.5"
            />
          </div>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
