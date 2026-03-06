"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, Upload, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

const profileTypes = ["flip", "invest"] as const;
type ProfileType = (typeof profileTypes)[number];

export default function SettingsPage(): React.ReactElement {
  const { data: settings, isLoading } = trpc.settings.get.useQuery();
  const utils = trpc.useUtils();
  const t = useTranslations("settings");
  const tc = useTranslations("common");

  const [commissionStars, setCommissionStars] = useState("");
  const [commissionPermille, setCommissionPermille] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState<"STARS" | "TON">("TON");
  const [timezone, setTimezone] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [starsToTonRate, setStarsToTonRate] = useState("");
  const [locale, setLocale] = useState<"en" | "ru" | "zh">("en");
  const [profileType, setProfileType] = useState<ProfileType>("flip");

  const importFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings) {
      setCommissionStars(String(settings.defaultCommissionStars));
      setCommissionPermille(String(settings.defaultCommissionPermille));
      const c = settings.defaultCurrency;
      if (c === "STARS" || c === "TON") setDefaultCurrency(c);
      setTimezone(settings.timezone);
      setWalletAddress(settings.tonWalletAddress ?? "");
      setStarsToTonRate(settings.starsToTonRate ?? "");
      const l = settings.locale;
      if (l === "en" || l === "ru" || l === "zh") setLocale(l);
      const p = settings.profileType;
      if (profileTypes.includes(p as ProfileType)) setProfileType(p as ProfileType);
    }
  }, [settings]);

  const updateSettings = trpc.settings.update.useMutation({
    onSuccess: (_data, variables) => {
      void utils.settings.get.invalidate();
      toast.success(t("settingsSaved"));
      // Sync locale cookie for next-intl (server reads it on next request)
      if (variables.locale) {
        const current = document.cookie.match(/(?:^|; )locale=([^;]*)/)?.[1];
        if (current !== variables.locale) {
          document.cookie = `locale=${variables.locale};path=/;max-age=${365 * 24 * 60 * 60};samesite=lax`;
          window.location.reload();
        }
      }
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const updateWalletAddress = trpc.settings.updateWalletAddress.useMutation({
    onSuccess: () => {
      void utils.settings.get.invalidate();
      toast.success(t("walletSaved"));
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
        locale,
        profileType,
      });
    } catch {
      toast.error(t("invalidCommission"));
    }
  };

  const handleExport = (): void => {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: settings ? {
        defaultCommissionStars: String(settings.defaultCommissionStars),
        defaultCommissionPermille: settings.defaultCommissionPermille,
        defaultCurrency: settings.defaultCurrency,
        timezone: settings.timezone,
        starsToTonRate: settings.starsToTonRate,
        locale: settings.locale,
        profileType: settings.profileType,
      } : null,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `giftfolio-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("configExportSuccess"));
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result;
        if (typeof text !== "string") throw new Error("Invalid file");
        const data: unknown = JSON.parse(text);
        if (
          typeof data !== "object" || data === null ||
          !("version" in data) || !("settings" in data)
        ) {
          throw new Error("Invalid backup format");
        }
        const backup = data as { version: number; settings: Record<string, unknown> | null };
        if (backup.settings) {
          const s = backup.settings;
          if (typeof s.defaultCommissionStars === "string") setCommissionStars(s.defaultCommissionStars);
          if (typeof s.defaultCommissionPermille === "number") setCommissionPermille(String(s.defaultCommissionPermille));
          if (s.defaultCurrency === "STARS" || s.defaultCurrency === "TON") setDefaultCurrency(s.defaultCurrency);
          if (typeof s.timezone === "string") setTimezone(s.timezone);
          if (typeof s.starsToTonRate === "string") setStarsToTonRate(s.starsToTonRate);
          if (s.locale === "en" || s.locale === "ru" || s.locale === "zh") setLocale(s.locale);
          if (profileTypes.includes(s.profileType as ProfileType)) setProfileType(s.profileType as ProfileType);
        }
        toast.success(t("configImportSuccess", { count: 0 }));
      } catch {
        toast.error(t("configImportError"));
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-selected
    e.target.value = "";
  };

  if (isLoading) return <SettingsSkeleton />;

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      {/* Commission */}
      <Card>
        <CardHeader>
          <CardTitle>{t("defaultCommission")}</CardTitle>
          <CardDescription>
            {t("commissionDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="commissionStars">{t("flatFee")}</Label>
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
              <Label htmlFor="commissionPermille">{t("commRate")}</Label>
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
          <CardTitle>{t("preferences")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("defaultCurrency")}</Label>
            <Select value={defaultCurrency} onValueChange={(v) => { if (v === "STARS" || v === "TON") setDefaultCurrency(v); }}>
              <SelectTrigger aria-label={t("defaultCurrency")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TON">TON</SelectItem>
                <SelectItem value="STARS">Stars</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone">{t("timezone")}</Label>
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
                {tc("detect")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("browserTz", { tz: Intl.DateTimeFormat().resolvedOptions().timeZone })}
            </p>
          </div>

          <div className="space-y-2">
            <Label>{t("language")}</Label>
            <Select value={locale} onValueChange={(v) => { if (v === "en" || v === "ru" || v === "zh") setLocale(v); }}>
              <SelectTrigger aria-label={t("language")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ru">Русский</SelectItem>
                <SelectItem value="zh">中文</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Profile Type */}
      <Card>
        <CardHeader>
          <CardTitle>{t("profileType")}</CardTitle>
          <CardDescription>{t("profileTypeDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {profileTypes.map((pt) => (
              <button
                key={pt}
                type="button"
                onClick={() => setProfileType(pt)}
                className={`rounded-lg border p-4 text-left transition-colors ${
                  profileType === pt
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <p className="font-medium">{t(pt === "flip" ? "profileFlip" : "profileInvest")}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t(pt === "flip" ? "profileFlipDesc" : "profileInvestDesc")}
                </p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Stars→TON Rate */}
      <Card>
        <CardHeader>
          <CardTitle>{t("starsToTonRate")}</CardTitle>
          <CardDescription>
            {t("starsToTonRateDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="starsToTonRate">{t("starsPerTon")}</Label>
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
                placeholder={t("starsPerTonPlaceholder")}
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
                  {tc("clear")}
                </Button>
              )}
            </div>
            {starsToTonRate && parseFloat(starsToTonRate) > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("oneStarApprox", { value: (1 / parseFloat(starsToTonRate)).toFixed(6) })}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* TON Wallet */}
      <Card>
        <CardHeader>
          <CardTitle>{t("tonWallet")}</CardTitle>
          <CardDescription>
            {t("tonWalletDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="walletAddress">{t("walletAddress")}</Label>
            <div className="flex gap-2">
              <Input
                id="walletAddress"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder={t("walletPlaceholder")}
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
                  {tc("clear")}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("walletHint")}
            </p>
          </div>
          <Button
            onClick={handleSaveWallet}
            disabled={updateWalletAddress.isPending}
            variant="secondary"
          >
            {updateWalletAddress.isPending ? t("savingWallet") : t("saveWallet")}
          </Button>
        </CardContent>
      </Card>

      {/* TON Connect stub */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            {t("tonConnect")}
            <Badge variant="secondary">{t("tonConnectSoon")}</Badge>
          </CardTitle>
          <CardDescription>{t("tonConnectDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button disabled variant="outline">
            {t("tonConnectBtn")}
          </Button>
        </CardContent>
      </Card>

      {/* Config Export / Import */}
      <Card>
        <CardHeader>
          <CardTitle>{t("configExport")}</CardTitle>
          <CardDescription>{t("configExportDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            {t("configExportBtn")}
          </Button>
          <div>
            <input
              ref={importFileRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportFile}
            />
            <Button variant="outline" onClick={() => importFileRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              {t("configImportBtn")}
            </Button>
          </div>
          <p className="w-full text-xs text-muted-foreground">{t("configImportDesc")}</p>
        </CardContent>
      </Card>

      <Button
        onClick={handleSave}
        disabled={updateSettings.isPending}
        className="w-full"
      >
        {updateSettings.isPending ? tc("saving") : t("saveSettings")}
      </Button>
    </div>
  );
}

function SettingsSkeleton(): React.ReactElement {
  const t = useTranslations("settings");
  return (
    <div className="mx-auto max-w-2xl space-y-6" role="status" aria-label={t("loadingSettings")}>
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
