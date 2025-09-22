"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { z } from "zod";
import {
  Camera,
  Check,
  ChevronRight,
  ImageIcon,
  Loader2,
  RefreshCw,
  Settings2,
  Sparkles,
  Upload,
} from "lucide-react";

import {
  type GenerationSettings,
  type Scenario,
  scenarioSchema,
} from "@/lib/schemas";
import { cn } from "@/lib/utils";

type GeneratedImage = {
  mimeType: string;
  data: string;
  scenario: Scenario;
};

const emptyScenarioState: Scenario[] = [];

const visualStyles = ["Natural", "Night Light", "Golden hour", "Soft morning"] as const;
const toneOptions = ["Playful", "Professional", "Minimal", "Cinematic"] as const;
const orientationOptions = ["Landscape", "Square (1:1)", "Portrait (2:3)"] as const;
const qualityOptions = ["Draft", "Standard", "Ultra"] as const;

const additionalToggles = [
  { key: "addMotion" as const, label: "Motion cues" },
  { key: "retouchProduct" as const, label: "Retouch product" },
  { key: "includeCaptions" as const, label: "Reserve caption space" },
];

const defaultSettings: GenerationSettings = {
  focusOnProduct: 3,
  shots: 6,
  visualStyle: visualStyles[0],
  tone: toneOptions[0],
  orientation: orientationOptions[1],
  quality: qualityOptions[1],
  addMotion: false,
  retouchProduct: true,
  includeCaptions: false,
};

const validation = z.object({
  threadId: z.string().optional(),
  scenarios: z.array(scenarioSchema).default([]),
});

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [threadId, setThreadId] = useState<string | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [initialisingThread, setInitialisingThread] = useState(false);

  const [productName, setProductName] = useState("");
  const [productAudience, setProductAudience] = useState("");
  const [productDetails, setProductDetails] = useState("");
  const [productNiche, setProductNiche] = useState("");

  const [productFile, setProductFile] = useState<File | null>(null);
  const [productPreview, setProductPreview] = useState<string | null>(null);

  const [settings, setSettings] = useState<GenerationSettings>(defaultSettings);

  const [scenarios, setScenarios] = useState<Scenario[]>(emptyScenarioState);
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<Set<string>>(new Set());
  const [generatingScenarios, setGeneratingScenarios] = useState(false);
  const [scenarioError, setScenarioError] = useState<string | null>(null);

  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [generatingImages, setGeneratingImages] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const canRequestScenarios = useMemo(() => {
    return Boolean(
      threadId &&
        productFile &&
        productAudience.trim().length > 0 &&
        productDetails.trim().length > 0,
    );
  }, [threadId, productFile, productAudience, productDetails]);

  const canGenerateImages = useMemo(() => {
    return selectedScenarioIds.size > 0 && productFile && !generatingScenarios;
  }, [selectedScenarioIds, productFile, generatingScenarios]);

  useEffect(() => {
    if (!productFile) {
      setProductPreview(null);
      return;
    }

    const objectUrl = URL.createObjectURL(productFile);
    setProductPreview(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [productFile]);

  const createThread = useCallback(async () => {
    try {
      setInitialisingThread(true);
      setThreadError(null);
      const response = await fetch("/api/openai/thread", {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Unable to start OpenAI assistant thread");
      }

      const data = await response.json();
      const parsed = validation.parse({ threadId: data.threadId });
      setThreadId(parsed.threadId ?? null);
    } catch (error) {
      console.error(error);
      setThreadError(
        error instanceof Error
          ? error.message
          : "We were unable to initialise the OpenAI assistant thread.",
      );
    } finally {
      setInitialisingThread(false);
    }
  }, []);

  useEffect(() => {
    void createThread();
  }, [createThread]);

  const handleFileSelection = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    setProductFile(file);
  };

  const toggleScenario = (id: string) => {
    setSelectedScenarioIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const updateSetting = <K extends keyof GenerationSettings>(key: K, value: GenerationSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleGenerateScenarios = async () => {
    if (!threadId) return;
    setGeneratingScenarios(true);
    setScenarioError(null);
    setGeneratedImages([]);

    try {
      const response = await fetch("/api/openai/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          audience: productAudience,
          productDetails,
          productName,
          niche: productNiche,
          tone: settings.tone,
          visualStyle: settings.visualStyle,
          shots: settings.shots,
          focusOnProduct: settings.focusOnProduct,
          additionalNotes: additionalToggles
            .filter((toggle) => settings[toggle.key])
            .map((toggle) => toggle.label),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Unable to generate scenarios");
      }

      const data = await response.json();
      const parsed = scenarioSchema.array().parse(data.scenarios);
      setScenarios(parsed);
      setSelectedScenarioIds(new Set(parsed.map((scenario) => scenario.id)));
    } catch (error) {
      console.error(error);
      setScenarioError(
        error instanceof Error ? error.message : "Scenario generation failed. Please try again.",
      );
    } finally {
      setGeneratingScenarios(false);
    }
  };

  const toBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1] ?? result;
        resolve(base64);
      };
      reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });

  const handleGenerateImages = async () => {
    if (!productFile) return;

    setGeneratingImages(true);
    setImageError(null);

    try {
      const base64 = await toBase64(productFile);
      const chosenScenarios = scenarios.filter((scenario) =>
        selectedScenarioIds.has(scenario.id),
      );

      if (chosenScenarios.length === 0) {
        throw new Error("Select at least one scenario to render");
      }

      const response = await fetch("/api/gemini/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          productName,
          scenarios: chosenScenarios,
          settings,
          productImage: {
            data: base64,
            mimeType: productFile.type || "image/png",
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Image generation failed");
      }

      const data = await response.json();
      const parsedImages = z
        .object({
          images: z.array(
            z.object({
              mimeType: z.string(),
              data: z.string(),
              scenario: scenarioSchema,
            }),
          ),
        })
        .parse(data);

      setGeneratedImages(parsedImages.images);
    } catch (error) {
      console.error(error);
      setImageError(
        error instanceof Error ? error.message : "Image generation failed. Please try again.",
      );
    } finally {
      setGeneratingImages(false);
    }
  };

  const renderScenarioCard = (scenario: Scenario) => {
    const isSelected = selectedScenarioIds.has(scenario.id);
    return (
      <button
        key={scenario.id}
        type="button"
        onClick={() => toggleScenario(scenario.id)}
        className={cn(
          "flex h-full flex-col rounded-2xl border p-4 text-left transition",
          "border-slate-200 bg-white shadow-sm hover:shadow-md",
          isSelected && "border-indigo-500 ring-2 ring-indigo-200",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{scenario.title}</h3>
            {scenario.hook ? (
              <p className="mt-1 text-sm text-indigo-600">{scenario.hook}</p>
            ) : null}
          </div>
          <div
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-medium",
              isSelected
                ? "border-transparent bg-indigo-500 text-white"
                : "border-slate-200 bg-slate-100 text-slate-500",
            )}
          >
            {isSelected ? <Check className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
          </div>
        </div>
        <p className="mt-3 line-clamp-3 text-sm text-slate-600">{scenario.summary}</p>
        {scenario.setting ? (
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">
            {scenario.setting}
          </p>
        ) : null}
        {scenario.shotList?.length ? (
          <div className="mt-3 space-y-1">
            {scenario.shotList.slice(0, 3).map((shot) => (
              <p key={shot} className="flex items-center gap-2 text-xs text-slate-500">
                <Camera className="h-3 w-3" /> {shot}
              </p>
            ))}
          </div>
        ) : null}
      </button>
    );
  };

  return (
    <main className="min-h-screen w-full pb-16">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pt-10 md:px-6">
        <header className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-indigo-600">
            <Sparkles className="h-4 w-4" />
            <span>UGC Studio</span>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold text-slate-900">Create UGC Content</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-500">
                Upload a hero shot of your product, describe your audience, and let OpenAI ideate six
                high-converting UGC concepts before Gemini renders them into production-ready imagery.
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="rounded-full bg-white px-3 py-1 font-medium text-slate-600 shadow">
                {selectedScenarioIds.size} selected
              </span>
              <span className="rounded-full bg-white px-3 py-1 font-medium text-slate-600 shadow">
                {threadError
                  ? "Assistant unavailable"
                  : initialisingThread
                    ? "Connecting…"
                    : "Assistant ready"}
              </span>
            </div>
          </div>
          {threadError ? (
            <div className="flex items-center justify-between rounded-2xl border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              <p>{threadError}</p>
              <button
                type="button"
                onClick={createThread}
                className="inline-flex items-center gap-1 rounded-full border border-amber-400 px-3 py-1 text-xs font-medium uppercase tracking-wide"
              >
                <RefreshCw className="h-3 w-3" /> Retry
              </button>
            </div>
          ) : null}
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Product image</h2>
                  <p className="mt-1 text-sm text-slate-500">PNG, JPG up to 5 MB. Color or drag & drop.</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <ImageIcon className="h-4 w-4" />
                  Required for context
                </div>
              </div>

              <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,280px)_1fr]">
                <div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="group relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50"
                  >
                    {productPreview ? (
                      <Image
                        src={productPreview}
                        alt="Product preview"
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-3 text-slate-500">
                        <Upload className="h-8 w-8" />
                        <span className="text-sm font-medium">Upload Product Image</span>
                        <span className="text-xs text-slate-400">Click to browse</span>
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg"
                      onChange={(event) => handleFileSelection(event.target.files)}
                      className="hidden"
                    />
                  </button>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-full border border-slate-200 bg-white px-3 py-2 font-medium text-slate-600 shadow-sm transition hover:border-indigo-300 hover:text-indigo-600"
                    >
                      Choose from library
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-dashed border-slate-200 px-3 py-2 font-medium text-slate-400 transition hover:border-indigo-200 hover:text-indigo-600"
                    >
                      Import from URL
                    </button>
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="grid gap-2">
                    <label className="text-sm font-semibold text-slate-700">Product name</label>
                    <input
                      value={productName}
                      onChange={(event) => setProductName(event.target.value)}
                      placeholder="What are we promoting?"
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-indigo-300 focus:bg-white"
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-semibold text-slate-700">Product niche & details</label>
                    <textarea
                      value={productDetails}
                      onChange={(event) => setProductDetails(event.target.value)}
                      placeholder="Detail the product, benefits, ingredients, differentiators"
                      rows={4}
                      maxLength={400}
                      className="resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-indigo-300 focus:bg-white"
                    />
                    <p className="text-xs text-slate-400">{productDetails.length}/400</p>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-semibold text-slate-700">Target audience</label>
                    <input
                      value={productAudience}
                      onChange={(event) => setProductAudience(event.target.value)}
                      placeholder="Who should resonate with this content?"
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-indigo-300 focus:bg-white"
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-semibold text-slate-700">Product niche</label>
                    <input
                      value={productNiche}
                      onChange={(event) => setProductNiche(event.target.value)}
                      placeholder="Beauty, tech gadget, wellness, etc."
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-indigo-300 focus:bg-white"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleGenerateScenarios}
                    disabled={!canRequestScenarios || generatingScenarios}
                    className={cn(
                      "inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white transition",
                      canRequestScenarios
                        ? "bg-indigo-600 hover:bg-indigo-500"
                        : "cursor-not-allowed bg-slate-300",
                    )}
                  >
                    {generatingScenarios ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {generatingScenarios ? "Thinking" : "Get Scenario Ideas"}
                  </button>
                  {scenarioError ? (
                    <p className="text-sm text-rose-500">{scenarioError}</p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">UGC Scenarios</h2>
                  <p className="text-sm text-slate-500">AI-generated concept ideas tailored to your brief</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
                  {generatingScenarios ? "Generating" : `${scenarios.length}/6 ready`}
                </span>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {generatingScenarios
                  ? Array.from({ length: 6 }).map((_, index) => (
                      <div
                        key={`placeholder-${index}`}
                        className="h-full animate-pulse rounded-2xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="h-4 w-2/3 rounded-full bg-slate-200" />
                        <div className="mt-4 space-y-2">
                          <div className="h-3 w-full rounded-full bg-slate-200" />
                          <div className="h-3 w-4/5 rounded-full bg-slate-200" />
                          <div className="h-3 w-3/5 rounded-full bg-slate-200" />
                        </div>
                      </div>
                    ))
                  : scenarios.length > 0
                    ? scenarios.map((scenario) => renderScenarioCard(scenario))
                    : (
                        <div className="col-span-2 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-slate-500">
                          <Sparkles className="h-6 w-6" />
                          <p className="text-sm">Generate scenarios to see OpenAI&apos;s ideas for your product.</p>
                        </div>
                      )}
              </div>
            </div>

            {generatedImages.length > 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-900">Generated gallery</h2>
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    {generatedImages.length} image{generatedImages.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  {generatedImages.map((image) => (
                    <figure key={image.scenario.id} className="overflow-hidden rounded-3xl border border-slate-100">
                      <Image
                        src={`data:${image.mimeType};base64,${image.data}`}
                        alt={image.scenario.title}
                        width={512}
                        height={512}
                        unoptimized
                        className="h-48 w-full object-cover"
                      />
                      <figcaption className="border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
                        <p className="font-semibold text-slate-800">{image.scenario.title}</p>
                        <p className="mt-1 line-clamp-2 text-slate-500">{image.scenario.summary}</p>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <aside className="flex flex-col gap-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                  <Settings2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Image settings</h2>
                  <p className="text-sm text-slate-500">Guidance for the final render</p>
                </div>
              </div>

              <div className="mt-6 space-y-6">
                <div>
                  <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-400">
                    <span>Credits</span>
                    <span>10 / 10</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-slate-100">
                    <div className="h-2 w-full rounded-full bg-indigo-500" />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm font-medium text-slate-600">
                    <span>Focus on product</span>
                    <span>{settings.focusOnProduct}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    value={settings.focusOnProduct}
                    onChange={(event) => updateSetting("focusOnProduct", Number(event.target.value))}
                    className="w-full accent-indigo-600"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm font-medium text-slate-600">
                    <span>Shots to produce</span>
                    <span>{settings.shots}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={12}
                    value={settings.shots}
                    onChange={(event) => updateSetting("shots", Number(event.target.value))}
                    className="w-full accent-indigo-600"
                  />
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Visual style</p>
                  <div className="flex flex-wrap gap-2">
                    {visualStyles.map((style) => (
                      <button
                        key={style}
                        type="button"
                        onClick={() => updateSetting("visualStyle", style)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                          settings.visualStyle === style
                            ? "border-indigo-500 bg-indigo-500 text-white"
                            : "border-slate-200 bg-slate-50 text-slate-600 hover:border-indigo-300 hover:text-indigo-600",
                        )}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tone</p>
                  <div className="flex flex-wrap gap-2">
                    {toneOptions.map((tone) => (
                      <button
                        key={tone}
                        type="button"
                        onClick={() => updateSetting("tone", tone)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                          settings.tone === tone
                            ? "border-indigo-500 bg-indigo-500 text-white"
                            : "border-slate-200 bg-slate-50 text-slate-600 hover:border-indigo-300 hover:text-indigo-600",
                        )}
                      >
                        {tone}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Orientation</p>
                  <div className="grid grid-cols-3 gap-2">
                    {orientationOptions.map((orientation) => (
                      <button
                        key={orientation}
                        type="button"
                        onClick={() => updateSetting("orientation", orientation)}
                        className={cn(
                          "rounded-2xl border px-3 py-3 text-xs font-medium transition",
                          settings.orientation === orientation
                            ? "border-indigo-500 bg-indigo-500/10 text-indigo-600"
                            : "border-slate-200 bg-slate-50 text-slate-600 hover:border-indigo-300 hover:text-indigo-600",
                        )}
                      >
                        {orientation}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Image quality</p>
                  <div className="flex flex-wrap gap-2">
                    {qualityOptions.map((quality) => (
                      <button
                        key={quality}
                        type="button"
                        onClick={() => updateSetting("quality", quality)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                          settings.quality === quality
                            ? "border-indigo-500 bg-indigo-500 text-white"
                            : "border-slate-200 bg-slate-50 text-slate-600 hover:border-indigo-300 hover:text-indigo-600",
                        )}
                      >
                        {quality}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Enhancements</p>
                  <div className="flex flex-col gap-2">
                    {additionalToggles.map((toggle) => (
                      <label
                        key={toggle.key}
                        className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600"
                      >
                        <span>{toggle.label}</span>
                        <input
                          type="checkbox"
                          checked={Boolean(settings[toggle.key])}
                          onChange={(event) => updateSetting(toggle.key, event.target.checked)}
                          className="h-4 w-4 accent-indigo-600"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-8 space-y-3">
                {imageError ? <p className="text-sm text-rose-500">{imageError}</p> : null}
                <button
                  type="button"
                  onClick={handleGenerateImages}
                  disabled={!canGenerateImages || generatingImages}
                  className={cn(
                    "inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white transition",
                    canGenerateImages
                      ? "bg-indigo-600 hover:bg-indigo-500"
                      : "cursor-not-allowed bg-slate-300",
                  )}
                >
                  {generatingImages ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  {generatingImages ? "Rendering" : "Generate images (2 credits)"}
                </button>
                <p className="text-xs text-slate-400">Generation typically takes 30-60 seconds.</p>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
