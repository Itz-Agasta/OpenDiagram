"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Check, KeyRound, Loader2, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { assetUrl } from "@/lib/site";
import {
  connectProvider,
  disconnectProvider,
  getAiSettings,
  updateProvider,
  type AiSettings,
  type CatalogProvider,
  type ConnectedProvider,
} from "@/lib/settings-client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { RecommendedBadge } from "@/components/ui/recommended-badge";
import { isRecommendedModel } from "@/lib/settings-client";

/** Maps BYOK catalog ids (see apps/server ai-provider registry) → public favicons. */
const PROVIDER_ICONS: Record<string, string> = {
  openai: assetUrl("/brand/favicons/chatgpt-icon.png"),
  anthropic: assetUrl("/brand/favicons/claude-icon.png"),
  google: assetUrl("/brand/favicons/gemini-icon.png"),
  openrouter: assetUrl("/brand/favicons/openrouter-icon.png"),
};

export function Providers() {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<CatalogProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setSettings(await getAiSettings());
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
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (!settings) {
    return (
      <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
        <p>{error ?? "Couldn't load Settings."}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => refresh()}>
          Retry
        </Button>
      </div>
    );
  }

  const connectedByProvider = new Map<string, ConnectedProvider>();
  for (const p of settings.providers) {
    if (!connectedByProvider.has(p.provider)) connectedByProvider.set(p.provider, p);
  }

  return (
    <div className="space-y-4">
      {!settings.encryptionReady && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
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

      <ConnectDialog
        key={connecting?.id ?? "closed"}
        provider={connecting}
        connected={connecting ? (connectedByProvider.get(connecting.id) ?? null) : null}
        onClose={() => setConnecting(null)}
        onConnected={refresh}
      />
    </div>
  );
}

function ProviderIcon({ providerId, label }: { providerId: string; label: string }) {
  const src = PROVIDER_ICONS[providerId];
  if (!src) {
    return (
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-semibold">
        {label.charAt(0)}
      </div>
    );
  }
  return (
    <div className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
      <Image src={src} alt="" width={28} height={28} className="size-7 object-contain" />
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

  async function run(action: () => Promise<void>, successMessage?: string) {
    setBusy(true);
    try {
      await action();
      await onChanged();
      if (successMessage) toast.success(successMessage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <ProviderIcon providerId={provider.id} label={provider.label} />
        <div>
          <div className="flex items-center gap-2 font-medium">
            {provider.label}
            {connected?.isDefault && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                <Check className="size-3" /> Default
              </span>
            )}
          </div>
          {connected ? (
            <div className="text-xs text-muted-foreground">
              {connected.modelId} · key ••••{connected.keyLast4}
            </div>
          ) : (
            <a
              href={provider.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Get an API key
            </a>
          )}
        </div>
      </div>

      {connected ? (
        <div className="flex items-center gap-2">
          <Select
            value={connected.modelId}
            disabled={busy}
            onValueChange={(modelId) =>
              run(() => updateProvider(connected.id, { modelId }), "Model updated.")
            }
          >
            <SelectTrigger className="h-9 w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {provider.models.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  <span className="flex items-center gap-2">
                    <span>{m.label}</span>
                    {isRecommendedModel(m.id, m.label) ? <RecommendedBadge /> : null}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!connected.isDefault && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                run(() => updateProvider(connected.id, { makeDefault: true }), "Set as default.")
              }
              title="Make default"
            >
              <Star className="size-4" />
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || busy}
            onClick={onConnect}
            title="Replace API key"
          >
            <KeyRound className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => run(() => disconnectProvider(connected.id), "Disconnected.")}
            title="Disconnect"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          </Button>
        </div>
      ) : (
        <Button size="sm" disabled={disabled} onClick={onConnect}>
          Connect
        </Button>
      )}
    </div>
  );
}

/**
 * Also the key-rotation dialog: `POST /providers` upserts on (userId, provider),
 * so reconnecting an already-connected provider replaces its key in place and
 * keeps the row, its id and its default flag. Seeding `modelId` from the saved
 * row matters because that upsert writes whatever model this form submits.
 */
function ConnectDialog({
  provider,
  connected,
  onClose,
  onConnected,
}: {
  provider: CatalogProvider | null;
  connected: ConnectedProvider | null;
  onClose: () => void;
  onConnected: () => Promise<void>;
}) {
  const [apiKey, setApiKey] = useState("");
  const [modelId, setModelId] = useState(connected?.modelId ?? provider?.models[0]?.id ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!provider) return;
    setSaving(true);
    try {
      await connectProvider({ provider: provider.id, apiKey: apiKey.trim(), modelId });
      toast.success(connected ? `${provider.label} key replaced.` : `${provider.label} connected.`);
      await onConnected();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not connect.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={provider !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {provider && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2.5">
                <ProviderIcon providerId={provider.id} label={provider.label} />
                {connected ? `Replace ${provider.label} key` : `Connect ${provider.label}`}
              </DialogTitle>
              <DialogDescription>
                {connected
                  ? `Replaces the key ending ${connected.keyLast4}. The new one is validated first, so a bad key leaves the old one in place.`
                  : "Your key is validated, then encrypted before it's stored. It's never shown again."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="byok-api-key">
                  API key
                </label>
                <Input
                  id="byok-api-key"
                  type="password"
                  autoComplete="off"
                  placeholder={provider.keyPlaceholder}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="byok-model">
                  Model
                </label>
                <Select value={modelId} onValueChange={setModelId}>
                  <SelectTrigger id="byok-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {provider.models.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        <span className="flex items-center gap-2">
                          <span>{m.label}</span>
                          {isRecommendedModel(m.id, m.label) ? <RecommendedBadge /> : null}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving || apiKey.trim().length < 8}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {connected ? "Validate & replace" : "Validate & connect"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
