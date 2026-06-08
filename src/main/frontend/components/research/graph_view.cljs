(ns frontend.components.research.graph-view
  "Research graph view – wraps the existing graph component and adds
   research-specific overlays: node-type filters and a selected-node info panel."
  (:require [frontend.components.graph :as graph]
            [frontend.context.i18n :refer [t]]
            [logseq.shui.hooks :as hooks]
            [logseq.shui.ui :as shui]
            [io.factorhouse.hsx.core :as hsx]))

;; ---------------------------------------------------------------------------
;; Node-type filter definitions
;; ---------------------------------------------------------------------------

(def ^:private node-type-filters
  [{:id :all    :icon "circles-relation" :label-key :research.graph/filter-all}
   {:id :paper  :icon "file-description" :label-key :research.graph/filter-papers}
   {:id :idea   :icon "bulb"             :label-key :research.graph/filter-ideas}
   {:id :method :icon "flask"            :label-key :research.graph/filter-methods}
   {:id :data   :icon "database"         :label-key :research.graph/filter-data}])

;; ---------------------------------------------------------------------------
;; Filter chip button
;; ---------------------------------------------------------------------------

(hsx/defc filter-chip
  [{:keys [filter active? on-click]}]
  (shui/button
   {:variant  (if active? :default :outline)
    :size     :sm
    :class    "text-xs gap-1.5"
    :on-click on-click}
   (shui/tabler-icon (:icon filter) {:size 13})
   (t (:label-key filter))))

;; ---------------------------------------------------------------------------
;; Selected-node info panel
;; ---------------------------------------------------------------------------

(hsx/defc node-info-panel
  [{:keys [selected-node]}]
  (when selected-node
    [:div.research-node-info.flex.flex-col.gap-3
     [:div
      [:h3.font-semibold.text-sm (:title selected-node)]]
     [:div.flex.flex-col.gap-1
      (shui/button
       {:variant :outline :size :sm :class "justify-start gap-2"}
       (shui/tabler-icon "sparkles" {:size 13})
       (t :research.graph/suggest-connections))
      (shui/button
       {:variant :outline :size :sm :class "justify-start gap-2"}
       (shui/tabler-icon "search" {:size 13})
       (t :research.graph/find-related-papers))
      (shui/button
       {:variant :outline :size :sm :class "justify-start gap-2"}
       (shui/tabler-icon "notes" {:size 13})
       (t :research.graph/add-to-ideation))]]))

;; ---------------------------------------------------------------------------
;; Research graph wrapper
;; ---------------------------------------------------------------------------

(hsx/defc research-graph
  []
  (let [[active-filter set-active-filter!] (hooks/use-state :all)
        [selected-node _set-selected-node!] (hooks/use-state nil)]
    [:div.research-graph-wrapper.flex.flex-col.h-full
     ;; Toolbar
     [:div.flex.items-center.gap-2.px-4.py-2.border-b.bg-background.z-10
      [:span.text-sm.font-medium.mr-2 (t :research.graph/filter-by)]
      (for [f node-type-filters]
        ^{:key (:id f)}
        [filter-chip {:filter   f
                      :active?  (= (:id f) active-filter)
                      :on-click #(set-active-filter! (:id f))}])
      [:div.ml-auto
       (shui/button
        {:variant :ghost :size :sm}
        (shui/tabler-icon "refresh" {:size 14 :class "mr-1"})
        (t :research.graph/recalculate))]]

     ;; Graph canvas + optional node sidebar
     [:div.flex.flex-1.min-h-0
      [:div.flex-1
       (graph/global-graph)]
      (when selected-node
        [:div.w-64.border-l.p-4.overflow-y-auto.bg-background
         (node-info-panel {:selected-node selected-node})])]]))
