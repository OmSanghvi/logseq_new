(ns frontend.components.research.core
  "Research IDE - core research workflow components.
   Provides Ideation, Methods, Validation, and Writing stages
   with AI-assisted tooling throughout."
  (:require [frontend.context.i18n :refer [t]]
            [frontend.handler.route :as route-handler]
            [frontend.state :as state]
            [frontend.ui :as ui]
            [logseq.shui.ui :as shui]
            [logseq.shui.hooks :as hooks]
            [reitit.frontend.easy :as rfe]
            [io.factorhouse.hsx.core :as hsx]))

;; ---------------------------------------------------------------------------
;; Stage card – a clickable research-workflow stage tile
;; ---------------------------------------------------------------------------

(hsx/defc stage-card
  [{:keys [icon title description href active? badge]}]
  [:a.research-stage-card
   {:href href
    :class (str "group flex flex-col gap-2 p-4 rounded-xl border cursor-pointer "
                "transition-all duration-150 select-none "
                (if active?
                  "border-accent bg-accent/10 shadow-sm"
                  "border-border bg-card hover:border-accent/60 hover:bg-accent/5"))}
   [:div.flex.items-center.gap-2
    [:span.text-2xl icon]
    (when badge
      [:span.ml-auto.text-xs.px-2.py-0.5.rounded-full.bg-accent.text-accent-foreground badge])]
   [:div
    [:p.font-semibold.text-sm.text-foreground title]
    [:p.text-xs.text-muted-foreground.mt-0.5 description]]])

;; ---------------------------------------------------------------------------
;; Research home – the hub that anchors all workflow stages
;; ---------------------------------------------------------------------------

(hsx/defc research-home
  []
  (let [_preferred-language (state/use-sub [:preferred-language])]
    [:div.research-home.p-8.max-w-4xl.mx-auto
     ;; Header
     [:div.mb-8
      [:h1.text-3xl.font-bold.tracking-tight.text-foreground
       (t :research/app-name)]
      [:p.text-muted-foreground.mt-1
       (t :research/tagline)]]

     ;; Stage grid
     [:div.grid.grid-cols-2.gap-4.md:grid-cols-4.mb-10
      (stage-card
       {:icon "💡"
        :title (t :research/stage-ideation)
        :description (t :research/stage-ideation-desc)
        :href (rfe/href :research/ideation)})
      (stage-card
       {:icon "🔬"
        :title (t :research/stage-methods)
        :description (t :research/stage-methods-desc)
        :href (rfe/href :research/methods)})
      (stage-card
       {:icon "✅"
        :title (t :research/stage-validation)
        :description (t :research/stage-validation-desc)
        :href (rfe/href :research/validation)})
      (stage-card
       {:icon "✍️"
        :title (t :research/stage-writing)
        :description (t :research/stage-writing-desc)
        :href (rfe/href :research/writing)})]

     ;; Quick-access row
     [:div.research-quick-access
      [:h2.text-lg.font-semibold.mb-3 (t :research/quick-access)]
      [:div.flex.gap-3.flex-wrap
       (shui/button
        {:variant :outline
         :size :sm
         :on-click #(route-handler/redirect-to-page! "research/literature")}
        (shui/tabler-icon "books" {:size 15 :class "mr-1.5"})
        (t :research/literature-notes))
       (shui/button
        {:variant :outline
         :size :sm
         :on-click #(route-handler/redirect-to-page! "research/hypotheses")}
        (shui/tabler-icon "bulb" {:size 15 :class "mr-1.5"})
        (t :research/hypotheses))
       (shui/button
        {:variant :outline
         :size :sm
         :on-click #(route-handler/redirect-to-page! "research/datasets")}
        (shui/tabler-icon "database" {:size 15 :class "mr-1.5"})
        (t :research/datasets))
       (shui/button
        {:variant :outline
         :size :sm
         :href (rfe/href :research/paper-search)}
        (shui/tabler-icon "search" {:size 15 :class "mr-1.5"})
        (t :research/search-papers))]]]))
