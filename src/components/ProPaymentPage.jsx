import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { httpsCallable } from "firebase/functions";
import { useNavigate } from "react-router-dom";
import { functions, auth } from "../firebase";

export default function ProPaymentPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const [buying, setBuying] = useState(false);
  const [errorKey, setErrorKey] = useState("");

  const createCheckoutSession = useMemo(() => {
    return httpsCallable(functions, "createCheckoutSession");
  }, []);

  const features = [
    t("payment.feature1"),
    t("payment.feature2"),
    t("payment.feature3"),
    t("payment.feature4"),
  ];

  const onBuy = async () => {
    try {
      setBuying(true);
      setErrorKey("");

      if (!auth.currentUser) {
        setErrorKey("proUnlock.loginRequired");
        return;
      }

      await auth.currentUser.getIdToken(true);

      const res = await createCheckoutSession({
        locale: i18n.resolvedLanguage || i18n.language || "fi",
      });

      const url = res?.data?.url;
      if (!url) {
        setErrorKey("proUnlock.buyFailed");
        return;
      }

      window.location.assign(url);
    } catch (error) {
      console.error("createCheckoutSession failed", error);
      setErrorKey("proUnlock.buyFailed");
    } finally {
      setBuying(false);
    }
  };

  const onCancel = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10 lg:py-12">
        <section className="space-y-6">
          <div className="space-y-4">
            <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
              {t("payment.badge")}
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                {t("payment.title")}
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
                {t("payment.description")}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="mb-2 text-sm font-semibold text-slate-500">
                {t("payment.trialTitle")}
              </div>
              <p className="text-sm leading-6 text-slate-600">
                {t("payment.trialText")}
              </p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="mb-2 text-sm font-semibold text-slate-500">
                {t("payment.dataTitle")}
              </div>
              <p className="text-sm leading-6 text-slate-600">
                {t("payment.dataText")}
              </p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="mb-2 text-sm font-semibold text-slate-500">
                {t("payment.emailTitle")}
              </div>
              <p className="text-sm leading-6 text-slate-600">
                {t("payment.emailText")}
              </p>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 md:p-7">
            <h2 className="text-xl font-semibold">{t("payment.featuresTitle")}</h2>

            <div className="mt-5 grid gap-3">
              {features.map((feature) => (
                <div
                  key={feature}
                  className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                    ✓
                  </div>
                  <p className="text-sm leading-6 text-slate-700">{feature}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-slate-200">
            <div className="bg-gradient-to-br from-sky-600 to-emerald-500 px-6 py-6 text-white md:px-7">
              <div className="text-sm font-medium text-white/90">
                {t("payment.brand")}
              </div>
              <div className="mt-2 text-2xl font-bold md:text-3xl">PRO</div>
              <p className="mt-3 max-w-sm text-sm leading-6 text-white/90">
                {t("payment.heroText")}
              </p>
            </div>

            <div className="space-y-5 px-6 py-6 md:px-7">
              <div>
                <div className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
                  {t("payment.price")}
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {t("payment.infoText")}
                </p>
              </div>

              {errorKey ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
                  {t(errorKey, { defaultValue: "Oston käynnistys epäonnistui." })}
                </div>
              ) : null}

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={onBuy}
                  disabled={buying}
                  className="w-full rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {buying
                    ? t("proUnlock.buying", { defaultValue: "Ohjataan..." })
                    : t("payment.buyButton")}
                </button>

                <button
                  type="button"
                  onClick={onCancel}
                  disabled={buying}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t("payment.cancel")}
                </button>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
                {t("payment.secure")}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}