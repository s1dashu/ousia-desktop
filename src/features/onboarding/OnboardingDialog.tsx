import { useEffect, useMemo, useState } from "react"
import {
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  Plus,
  Terminal,
} from "@/components/icons/huge-icons"

import { getMessages } from "@/app/i18n"
import type { AppSettings } from "@/app/app-state"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type {
  OusiaModelRegistryResult,
  OusiaPiEnvironmentStatus,
  OusiaPiInstallResult,
  OusiaPiProviderCredentialResult,
} from "@/electron/chat-types"
import { cn } from "@/lib/utils"

type OnboardingStep = "pi" | "provider"

type OnboardingDialogProps = {
  isCheckingPi: boolean
  isInstallingPi: boolean
  isSavingProvider: boolean
  modelRegistry: OusiaModelRegistryResult | undefined
  onComplete: () => void
  onInstallPi: () => Promise<OusiaPiInstallResult>
  onRefreshPi: () => void
  onSaveProvider: (
    providerId: string,
    apiKey: string
  ) => Promise<OusiaPiProviderCredentialResult>
  open: boolean
  piEnvironment: OusiaPiEnvironmentStatus | undefined
  settings: AppSettings
}

function StepBadge({
  active,
  done,
  label,
}: {
  active: boolean
  done: boolean
  label: string
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium",
        active || done
          ? "bg-neutral-950 text-white"
          : "bg-neutral-100 text-neutral-500"
      )}
    >
      <span
        className={cn(
          "grid size-4 shrink-0 place-items-center rounded-full text-[10px]",
          active || done ? "bg-white/18" : "bg-white"
        )}
      >
        {done ? <CircleCheck size={13} /> : null}
      </span>
      <span className="truncate">{label}</span>
    </div>
  )
}

export function OnboardingDialog({
  isCheckingPi,
  isInstallingPi,
  isSavingProvider,
  modelRegistry,
  onComplete,
  onInstallPi,
  onRefreshPi,
  onSaveProvider,
  open,
  piEnvironment,
  settings,
}: OnboardingDialogProps) {
  const t = getMessages(settings.language)
  const [step, setStep] = useState<OnboardingStep>("pi")
  const [providerId, setProviderId] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [error, setError] = useState("")

  const providerOptions = useMemo(
    () =>
      modelRegistry?.providers.filter((provider) => provider.models.length > 0) ??
      [],
    [modelRegistry]
  )
  const defaultProvider =
    providerOptions.find((provider) => provider.id === settings.modelProvider) ??
    providerOptions.find((provider) => provider.id === "deepseek") ??
    providerOptions[0]
  const selectedProviderId = providerOptions.some(
    (provider) => provider.id === providerId
  )
    ? providerId
    : (defaultProvider?.id ?? "")
  const selectedProvider = providerOptions.find(
    (provider) => provider.id === selectedProviderId
  )
  const hasConfiguredCredential = Boolean(piEnvironment?.hasConfiguredCredential)
  const isPiInstalled = Boolean(piEnvironment?.cliInstalled)
  const configuredProviderText =
    piEnvironment?.configuredProviderIds.join(", ") ?? ""
  const canSaveProvider = Boolean(selectedProvider && apiKey.trim())

  useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        setStep("pi")
        setError("")
        setProviderId("")
      })
    }
  }, [open])

  async function installPi() {
    setError("")
    const result = await onInstallPi()
    if (!result.ok) {
      setError(result.error ?? t.onboarding.installFailed)
      return
    }
    setStep("provider")
  }

  function continueFromPi() {
    setError("")
    if (hasConfiguredCredential) {
      onComplete()
      return
    }
    setStep("provider")
  }

  async function saveProvider() {
    if (!canSaveProvider) {
      return
    }
    setError("")
    const result = await onSaveProvider(selectedProviderId, apiKey)
    if (!result.ok) {
      setError(result.error ?? t.onboarding.providerSaveFailed)
      return
    }
    setApiKey("")
    onComplete()
  }

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl">{t.onboarding.title}</DialogTitle>
          <DialogDescription>
            {step === "pi"
              ? t.onboarding.piStep
              : t.onboarding.providerDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-5 flex flex-wrap gap-2">
          <StepBadge
            active={step === "pi"}
            done={step === "provider"}
            label={t.onboarding.piStep}
          />
          <StepBadge
            active={step === "provider"}
            done={false}
            label={t.onboarding.providerStep}
          />
        </div>

        {step === "pi" ? (
          <div className="mt-6 grid gap-4">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "mt-0.5 grid size-9 shrink-0 place-items-center rounded-full",
                  isCheckingPi
                    ? "bg-neutral-100 text-neutral-500"
                    : isPiInstalled
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700"
                )}
              >
                {isCheckingPi ? (
                  <LoaderCircle size={18} className="animate-spin" />
                ) : isPiInstalled ? (
                  <CircleCheck size={19} />
                ) : (
                  <CircleAlert size={19} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">
                  {isCheckingPi
                    ? t.onboarding.checkingPi
                    : isPiInstalled
                      ? t.onboarding.piFound
                      : t.onboarding.piMissing}
                </div>
                <div className="mt-1 break-words text-sm leading-6 text-neutral-500">
                  {isPiInstalled && piEnvironment
                    ? t.onboarding.piFoundDescription(piEnvironment.agentDir)
                    : t.onboarding.piMissingDescription}
                </div>
              </div>
            </div>

            {piEnvironment ? (
              <div className="grid gap-2 rounded-2xl border-[0.5px] border-neutral-950/10 bg-neutral-50 px-3 py-3 text-sm">
                <div className="flex min-w-0 items-center gap-2 text-neutral-600">
                  <Terminal size={16} />
                  <span className="truncate">
                    {piEnvironment.cliPath ?? piEnvironment.installCommand}
                  </span>
                </div>
                <div className="text-neutral-500">
                  {hasConfiguredCredential && configuredProviderText
                    ? t.onboarding.piConfiguredProviders(configuredProviderText)
                    : t.onboarding.piNoConfiguredProviders}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-6 grid gap-4">
            {hasConfiguredCredential ? (
              <div className="flex items-start gap-3 rounded-2xl border-[0.5px] border-emerald-600/20 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                <CircleCheck size={18} />
                <span>{t.onboarding.providerReady}</span>
              </div>
            ) : null}
            <label className="grid gap-2">
              <span className="text-xs font-medium text-neutral-500">
                {t.settings.provider}
              </span>
              <Select
                items={providerOptions.map((provider) => ({
                  label: provider.name,
                  value: provider.id,
                }))}
                value={selectedProviderId}
                onValueChange={(value) => setProviderId(value ?? "")}
              >
                <SelectTrigger
                  aria-label={t.settings.provider}
                  className="ousia-squircle-corners w-full rounded-xl border-[0.5px] border-neutral-950/10 bg-white hover:bg-white"
                >
                  <SelectValue placeholder={t.settings.chooseProvider} />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectGroup>
                    {providerOptions.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-medium text-neutral-500">API Key</span>
              <Input
                aria-label="API Key"
                className="ousia-squircle-corners rounded-xl border-[0.5px] border-neutral-950/10 bg-white focus-visible:bg-white"
                placeholder="sk-..."
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && canSaveProvider) {
                    event.preventDefault()
                    void saveProvider()
                  }
                }}
              />
              {!apiKey.trim() ? (
                <span className="text-xs leading-5 text-neutral-500">
                  {t.settings.apiKeyRequired}
                </span>
              ) : null}
            </label>
          </div>
        )}

        {error ? (
          <div className="mt-4 rounded-2xl border-[0.5px] border-red-500/20 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700">
            {error}
          </div>
        ) : null}

        <DialogFooter className="mt-6">
          {step === "pi" ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ousia-squircle-corners h-10 rounded-2xl border-[0.5px] border-neutral-950/10 bg-white px-4 text-neutral-950 hover:bg-neutral-50"
                disabled={isCheckingPi || isInstallingPi}
                onClick={onRefreshPi}
              >
                <LoaderCircle
                  size={16}
                  className={cn(isCheckingPi && "animate-spin")}
                />
                {t.onboarding.retry}
              </Button>
              {isPiInstalled ? (
                <Button
                  type="button"
                  size="sm"
                  className="ousia-squircle-corners h-10 rounded-2xl bg-neutral-950 px-5 text-white hover:bg-neutral-800"
                  disabled={isCheckingPi}
                  onClick={continueFromPi}
                >
                  <CircleCheck size={17} />
                  {hasConfiguredCredential
                    ? t.onboarding.finish
                    : t.onboarding.continue}
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  className="ousia-squircle-corners h-10 rounded-2xl bg-neutral-950 px-5 text-white hover:bg-neutral-800"
                  disabled={isCheckingPi || isInstallingPi}
                  onClick={() => void installPi()}
                >
                  {isInstallingPi ? (
                    <LoaderCircle size={17} className="animate-spin" />
                  ) : (
                    <Plus size={17} />
                  )}
                  {isInstallingPi
                    ? t.onboarding.installingPi
                    : t.onboarding.installPi}
                </Button>
              )}
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              className="ousia-squircle-corners h-10 rounded-2xl bg-neutral-950 px-5 text-white hover:bg-neutral-800"
              disabled={!canSaveProvider || isSavingProvider}
              onClick={() => void saveProvider()}
            >
              {isSavingProvider ? (
                <LoaderCircle size={17} className="animate-spin" />
              ) : (
                <CircleCheck size={17} />
              )}
              {isSavingProvider
                ? t.onboarding.savingProvider
                : t.onboarding.saveProvider}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
