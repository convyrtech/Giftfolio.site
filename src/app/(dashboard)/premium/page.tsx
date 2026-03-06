"use client";

import { useTranslations } from "next-intl";
import { Crown, Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const tiers = [
  { key: "free", featureCount: 3, featured: false, current: true },
  { key: "starter", featureCount: 4, featured: false, current: false },
  { key: "pro", featureCount: 4, featured: true, current: false },
] as const;

export default function PremiumPage(): React.ReactElement {
  const t = useTranslations("premium");

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-4">
      <div className="flex items-center gap-2">
        <Crown className="h-6 w-6 text-yellow-500" />
        <h1 className="text-2xl font-bold">{t("title")}</h1>
      </div>
      <p className="text-muted-foreground">{t("subtitle")}</p>

      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-sm text-muted-foreground">{t("comingSoon")}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {tiers.map((tier) => (
          <Card
            key={tier.key}
            className={tier.featured ? "border-primary ring-1 ring-primary" : ""}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{t(tier.key)}</CardTitle>
                {tier.featured && (
                  <Badge variant="default">{t("popular")}</Badge>
                )}
              </div>
              <CardDescription>{t(`${tier.key}Desc`)}</CardDescription>
              {tier.key !== "free" && (
                <p className="text-2xl font-bold">{t(`${tier.key}Price`)}</p>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-2 text-sm">
                {Array.from({ length: tier.featureCount }, (_, i) => {
                  const featureKey = `${tier.key}Feature${i + 1}`;
                  return (
                    <li key={featureKey} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                      <span>{t(featureKey)}</span>
                    </li>
                  );
                })}
              </ul>
              <Button
                variant={tier.current ? "outline" : "default"}
                className="w-full"
                disabled
              >
                {tier.current ? t("currentPlan") : t("comingSoon")}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
