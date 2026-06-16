(ns frontend.components.research.ideation
  "Ideation workspace – captures emerging research ideas, auto-links
   to related notes via the existing search index, and surfaces
   relevant literature from the local graph."
  (:require [clojure.string :as string]
            [frontend.components.research.ai-assistant :as ai-assistant]
            [frontend.context.i18n :refer [t]]
            [frontend.handler.page :as page-handler]
            [frontend.handler.route :as route-handler]
            [frontend.state :as state]
            [logseq.shui.hooks :as hooks]
            [logseq.shui.ui :as shui]
            [reitit.frontend.easy :as rfe]
            [io.factorhouse.hsx.core :as hsx]))

;; ---------------------------------------------------------------------------
;; Idea card
;; ---------------------------------------------------------------------------

(hsx/defc idea-card
  [{:keys [title desc href on-open]}]
  [:div.idea-card.group.border.rounded-lg.p-3.bg-card.cursor-pointer
   {:on-click (fn [] (if href (set! js/window.location.hash href) (when on-open (on-open))))}
   [:div.flex.items-start.justify-between.gap-2
    [:div
     [:p.font-medium.text-sm.text-foreground.leading-snug title]
     (when desc [:p.text-xs.text-muted-foreground.mt-0.5.line-clamp-2 desc])]
    (shui/tabler-icon "arrow-up-right" {:size 14 :class "opacity-0 group-hover:opacity-60 transition-opacity mt-0.5"})]])

;; ---------------------------------------------------------------------------
;; Ideation workspace view
;; ---------------------------------------------------------------------------

(hsx/defc ideation
  []
  (let [[idea-text set-idea-text!] (hooks/use-state "")
        [show-ai? set-show-ai?!] (hooks/use-state false)
        create-idea-page! (fn []
                            (when-not (string/blank? idea-text)
                              (page-handler/<create!
                               (str "Idea: " (subs idea-text 0 60))
                               {:redirect? true :edit? false})))]
    [:div.ideation-workspace.flex.h-full
     ;; Main panel
     [:div.flex-1.flex.flex-col.p-6.overflow-y-auto
      [:h1.text-2xl.font-bold.mb-1 (t :research/stage-ideation)]
      [:p.text-muted-foreground.text-sm.mb-6 (t :research.ideation/subtitle)]

      ;; New idea input
      [:div.rounded-xl.border.bg-card.p-4.mb-6
       [:label.text-sm.font-medium.block.mb-2 (t :research.ideation/new-idea-label)]
       [:textarea.w-full.rounded-lg.border.border-input.bg-background.text-sm.p-3.resize-none
        {:rows 4
         :placeholder (t :research.ideation/new-idea-placeholder)
         :value idea-text
         :on-change #(set-idea-text! (.. % -target -value))}]
       [:div.flex.justify-between.items-center.mt-3
        (shui/button
         {:variant :outline :size :sm
          :on-click #(set-show-ai?! (not show-ai?))}
         (shui/tabler-icon "sparkles" {:size 14 :class "mr-1.5"})
         (t :research.ai/assist))
        (shui/button
         {:size :sm
          :disabled (string/blank? idea-text)
          :on-click create-idea-page!}
         (shui/tabler-icon "notes" {:size 14 :class "mr-1.5"})
         (t :research.ideation/create-note))]]

      ;; Workflow guidance cards
      [:h2.text-base.font-semibold.mb-3 (t :research.ideation/workflow-title)]
      [:div.grid.grid-cols-1.gap-2.md:grid-cols-2
       (idea-card {:title (t :research.ideation/card-literature)
                   :desc (t :research.ideation/card-literature-desc)
                   :href (rfe/href :research/paper-search)})
       (idea-card {:title (t :research.ideation/card-graph)
                   :desc (t :research.ideation/card-graph-desc)
                   :href (rfe/href :graph)})
       (idea-card {:title (t :research.ideation/card-hypotheses)
                   :desc (t :research.ideation/card-hypotheses-desc)
                   :on-open #(route-handler/redirect-to-page! "research/hypotheses")})
       (idea-card {:title (t :research.ideation/card-related)
                   :desc (t :research.ideation/card-related-desc)
                   :on-open #(route-handler/redirect-to-page! "research/related-work")})]]

     ;; AI side panel
     (when show-ai?
       [:div.w-80.border-l.flex.flex-col.h-full
        [:div.flex.items-center.justify-between.p-3.border-b
         [:span.font-medium.text-sm (t :research.ai/panel-title)]
         (shui/button {:variant :ghost :size :sm :on-click #(set-show-ai?! false)}
                      (shui/tabler-icon "x" {:size 14}))]
        (ai-assistant/ai-assistant-panel)])]))
