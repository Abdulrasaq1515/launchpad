import { UseFormRegister, FieldErrors } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/Input";
import { DeployFormData } from "../DeployForm";

interface StepProps {
    register: UseFormRegister<DeployFormData>;
    errors: FieldErrors<DeployFormData>;
}

export const StepMetadata = ({ register, errors }: StepProps) => {
    const t = useTranslations("deploy.metadata");
    return (
        <div className="space-y-6">
            <div className="text-left">
                <h2 className="text-xl font-bold text-ink mb-2">{t("title")}</h2>
                <p className="text-sm text-muted">{t("description")}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                    label={t("tokenName")}
                    placeholder={t("tokenNamePlaceholder")}
                    {...register("name")}
                    error={errors.name?.message as string}
                />
                <Input
                    label={t("symbol")}
                    placeholder={t("symbolPlaceholder")}
                    {...register("symbol")}
                    error={errors.symbol?.message as string}
                />
            </div>

            <Input
                label={t("decimals")}
                type="number"
                placeholder={t("decimalsPlaceholder")}
                {...register("decimals", { valueAsNumber: true })}
                error={errors.decimals?.message as string}
            />

            <Input
                label={t("descriptionLabel")}
                placeholder={t("descriptionPlaceholder")}
                {...register("description")}
                error={errors.description?.message as string}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                    label={t("logoUrl")}
                    placeholder={t("logoUrlPlaceholder")}
                    {...register("logoUrl")}
                    error={errors.logoUrl?.message as string}
                />
                <Input
                    label={t("website")}
                    placeholder={t("websitePlaceholder")}
                    {...register("website")}
                    error={errors.website?.message as string}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                    label={t("twitter")}
                    placeholder={t("twitterPlaceholder")}
                    {...register("twitter")}
                    error={errors.twitter?.message as string}
                />
                <Input
                    label={t("discord")}
                    placeholder={t("discordPlaceholder")}
                    {...register("discord")}
                    error={errors.discord?.message as string}
                />
            </div>
        </div>
    );
};
