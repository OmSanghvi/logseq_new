(ns frontend.components.research.writing
  "Writing stage – compose research outputs with AI-assisted structure and feedback."
  (:require [clojure.string :as string]
            [frontend.components.research.ai-assistant :as ai-assistant]
            [frontend.context.i18n :refer [t]]
            [frontend.handler.page :as page-handler]
            [logseq.shui.hooks :as hooks]
            [logseq.shui.ui :as shui]
            [io.factorhouse.hsx.core :as hsx]))

;; ---------------------------------------------------------------------------
;; Document templates
;; ---------------------------------------------------------------------------

(def ^:private document-templates
  {:research-paper
   {:name     "Research Paper"
    :sections ["Abstract" "Introduction" "Related Work" "Methods"
               "Results" "Discussion" "Conclusion" "References"]}
   :literature-review
   {:name     "Literature Review"
    :sections ["Introduction" "Search Strategy" "Thematic Analysis"
               "Critical Evaluation" "Research Gaps" "Conclusion"]}
   :research-proposal
   {:name     "Research Proposal"
    :sections ["Problem Statement" "Research Questions" "Objectives"
               "Methodology" "Timeline" "Budget" "Expected Outcomes"]}})

;; ---------------------------------------------------------------------------
;; Section outline panel
;; ---------------------------------------------------------------------------

(hsx/defc section-outline
  [{:keys [template-key on-select-section]}]
  (let [sections (get-in document-templates [template-key :sections] [])]
    [:div.section-outline
     [:p.text-xs.font-medium.text-muted-foreground.uppercase.tracking-wide.mb-2
      (t :research.writing/outline)]
     [:ul.flex.flex-col
      (for [section sections]
        [:li {:key      section
              :class    "text-sm px-2 py-1 rounded cursor-pointer hover:bg-accent hover:text-accent-foreground"
              :on-click #(on-select-section section)}
         section])]]))

;; ---------------------------------------------------------------------------
;; Word / char count bar
;; ---------------------------------------------------------------------------

(hsx/defc writing-stats
  [{:keys [word-count char-count]}]
  [:div.flex.gap-4.text-xs.text-muted-foreground
   [:span (str word-count " " (t :research.writing/words))]
   [:span (str char-count " " (t :research.writing/chars))]])

;; ---------------------------------------------------------------------------
;; Template picker card
;; ---------------------------------------------------------------------------

(hsx/defc template-card
  [{:keys [tkey tval on-select]}]
  [:button
   {:class    "w-full text-left border rounded-xl p-4 bg-card hover:border-accent transition-all"
    :on-click #(on-select tkey)}
   [:p.font-semibold.text-sm (:name tval)]
   [:p.text-xs.text-muted-foreground.mt-1
    (str (count (:sections tval)) " sections: "
         (string/join ", " (take 3 (:sections tval))) "…")]])

;; ---------------------------------------------------------------------------
;; Writing workspace
;; ---------------------------------------------------------------------------

(hsx/defc writing-workspace
  []
  (let [[selected-template set-template!]     (hooks/use-state nil)
        [show-ai?          set-show-ai?!]      (hooks/use-state false)
        [show-outline?     set-show-outline?!] (hooks/use-state false)
        [draft             _set-draft!]        (hooks/use-state "")
        word-count (count (string/split (or draft " ") #"\s+"))
        char-count (count draft)

        select-template! (fn [tkey]
                           (set-template! tkey)
                           (let [page-name (str "Draft: "
                                               (get-in document-templates [tkey :name])
                                               " " (.toLocaleDateString (js/Date.)))]
                             (page-handler/<create! page-name {:redirect? true :edit? false})))]

    (if-not selected-template
      ;; ---- Template picker ----
      [:div.writing-workspace.p-8.max-w-2xl.mx-auto
       [:h1.text-2xl.font-bold.mb-1 (t :research/stage-writing)]
       [:p.text-muted-foreground.text-sm.mb-8 (t :research.writing/subtitle)]
       [:h2.text-base.font-semibold.mb-4 (t :research.writing/choose-template)]
       [:div.grid.grid-cols-1.gap-3
        (for [[tkey tval] document-templates]
          ^{:key (name tkey)}
          [template-card {:tkey     tkey
                          :tval     tval
                          :on-select select-template!}])]]

      ;; ---- Editor shell ----
      [:div.writing-workspace.flex.flex-col.h-full

       ;; Toolbar
       [:div.flex.items-center.gap-2.px-4.py-2.border-b
        [:span.text-sm.font-medium
         (get-in document-templates [selected-template :name])]
        [:div.ml-auto.flex.items-center.gap-2
         (writing-stats {:word-count word-count :char-count char-count})
         (shui/button
          {:variant  :ghost
           :size     :sm
           :on-click #(set-show-outline?! (not show-outline?))}
          (shui/tabler-icon "list" {:size 15}))
         (shui/button
          {:variant  (if show-ai? :default :ghost)
           :size     :sm
           :class    "gap-1.5"
           :on-click #(set-show-ai?! (not show-ai?))}
          (shui/tabler-icon "sparkles" {:size 14})
          (t :research.ai/assist))]]

       ;; Body
       [:div.flex.flex-1.min-h-0

        ;; Section outline
        (when show-outline?
          [:div.w-48.border-r.p-3.overflow-y-auto
           (section-outline {:template-key      selected-template
                             :on-select-section (fn [s] (set! js/document.title s))})])

        ;; Placeholder while page editor loads
        [:div.flex-1.flex.flex-col.items-center.justify-center.text-muted-foreground
         (shui/tabler-icon "pencil" {:size 32 :class "mb-2 opacity-20"})
         [:p.text-sm (t :research.writing/editor-hint)]]

        ;; AI assistant panel
        (when show-ai?
          [:div.w-80.border-l.flex.flex-col.h-full
           (ai-assistant/ai-assistant-panel)])]])))
