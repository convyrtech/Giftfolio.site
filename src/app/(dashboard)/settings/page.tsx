"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc/client";

export default function SettingsPage(): React.ReactElement {
  const { data: settings, isLoading } = trpc.settings.get.useQuery();
  const utils = trpc.useUtils();

  const [commissionStars, setCommissionStars] = useState("");
  const [commissionPermille, setCommissionPermille] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState<"STARS" | "TON">("TON");
  const [timezone, setTimezone] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [starsToTonRate, setStarsToTonRate] = useState("");

  useEffect(() => {
    if (settings) {
      setCommissionStars(String(settings.defaultCommissionStars));
      setCommissionPermille(String(settings.defaultCommissionPermille));
      const c = settings.defaultCurrency;
      if (c === "STARS" || c === "TON") setDefaultCurrency(c);
      setTimezone(settings.timezone);
      setWalletAddress(settings.tonWalletAddress ?? "");
      setStarsToTonRate(settings.starsToTonRate ?? "");
    }
  }, [settings]);

  const updateSettings = trpc.settings.update.useMutation({
    onSuccess: () => {
      void utils.settings.get.invalidate();
      toast.success("Settings saved");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const updateWalletAddress = trpc.settings.updateWalletAddress.useMutation({
    onSuccess: () => {
      void utils.settings.get.invalidate();
      toast.success("Wallet address saved");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleSaveWallet = (): void => {
    updateWalletAddress.mutate({
      tonWalletAddress: walletAddress.trim() || null,
    });
  };

  const handleSave = (): void => {
    try {
      updateSettings.mutate({
        defaultCommissionStars: BigInt(commissionStars || "0"),
        defaultCommissionPermille: parseInt(commissionPermille || "0", 10),
        defaultCurrency,
        timezone,
        starsToTonRate: starsToTonRate.trim() || null,
      });
    } catch {
      toast.error("Invalid commission value");
    }
  };

  if (isLoading) return <SettingsSkeleton />;

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-4">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Commission */}
      <Card>
        <CardHeader>
          <CardTitle>Default Commission</CardTitle>
          <CardDescription>
            Applied to new trades only. Existing trades are not affected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="commissionStars">Flat fee (Stars)</Label>
              <Input
                id="commissionStars"
                type="text"
                inputMode="numeric"
                value={commissionStars}
                onChange={(e) => setCommissionStars(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="commissionPermille">Rate (permille)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="commissionPermille"
                  type="text"
                  inputMode="numeric"
                  value={commissionPermille}
                  onChange={(e) =>
                    setCommissionPermille(e.target.value.replace(/[^0-9]/g, ""))
                  }
                  placeholder="0"
                />
                <span className="shrink-0 text-sm text-muted-foreground">/1000</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {commissionPermille
                  ? `${(parseInt(commissionPermille, 10) / 10).toFixed(1)}%`
                  : "0%"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Default Currency</Label>
            <Select value={defaultCurrency} onValueChange={(v) => { if (v === "STARS" || v === "TON") setDefaultCurrency(v); }}>
              <SelectTrigger aria-label="Default currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TON">TON</SelectItem>
                <SelectItem value="STARS">Stars</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <div className="flex gap-2">
              <Input
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="Europe/Moscow"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 self-center"
                onClick={() => setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)}
              >
                Detect
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Browser: {Intl.DateTimeFormat().resolvedOptions().timeZone}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Stars→TON Rate */}
      <Card>
        <CardHeader>
          <CardTitle>Stars → TON Rate</CardTitle>
          <CardDescription>
            How many Stars = 1 TON. Used to show combined PnL across currencies.
            Leave empty to hide cross-currency totals.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="starsToTonRate">Stars per 1 TON</Label>
            <div className="flex gap-2">
              <Input
                id="starsToTonRate"
                type="text"
                inputMode="decimal"
                value={starsToTonRate}
                onChange={(e) => {
                  let v = e.target.value.replace(/[^0-9.]/g, "");
                  // Allow only one dot
                  const dotIdx = v.indexOf(".");
                  if (dotIdx !== -1) v = v.slice(0, dotIdx + 1) + v.slice(dotIdx + 1).replace(/\./g, "");
                  setStarsToTonRate(v);
                }}
                placeholder="e.g. 770 (check Fragment market)"
                className="flex-1"
              />
              {starsToTonRate && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 self-center"
                  onClick={() => setStarsToTonRate("")}
                >
                  Clear
                </Button>
              )}
            </div>
            {starsToTonRate && parseFloat(starsToTonRate) > 0 && (
              <p className="text-xs text-muted-foreground">
                1 ★ ≈ {(1 / parseFloat(starsToTonRate)).toFixed(6)} TON
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* TON Wallet */}
      <Card>
        <CardHeader>
          <CardTitle>TON Wallet</CardTitle>
          <CardDescription>
            Link your TON wallet to auto-import gift trades from your on-chain history.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="walletAddress">Wallet Address</Label>
            <div className="flex gap-2">
              <Input
                id="walletAddress"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="UQA... or EQ..."
                className="flex-1 font-mono text-sm"
              />
              {walletAddress && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 self-center"
                  onClick={() => setWalletAddress("")}
                >
                  Clear
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Supports TON friendly address format (UQ…, EQ…, 0:…)
            </p>
          </div>
          <Button
            onClick={handleSaveWallet}
            disabled={updateWalletAddress.isPending}
            variant="secondary"
          >
            {updateWalletAddress.isPending ? "Saving..." : "Save wallet address"}
          </Button>
        </CardContent>
      </Card>

      <Button
        onClick={handleSave}
        disabled={updateSettings.isPending}
        className="w-full"
      >
        {updateSettings.isPending ? "Saving..." : "Save settings"}
      </Button>
    </div>
  );
}

function SettingsSkeleton(): React.ReactElement {
  return (
    <div className="mx-auto max-w-2xl space-y-6" role="status" aria-label="Loading settings">
      <Skeleton className="h-8 w-32" />
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
