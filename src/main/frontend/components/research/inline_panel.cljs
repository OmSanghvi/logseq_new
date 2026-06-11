(ns frontend.components.research.inline-panel
  "Inline research panel rendered natively below blocks that contain
   research-relevant content. Shows:
   - Existing graph pages that semantically overlap with the block
   - One-click Semantic Scholar search
   Clicking a page navigates to it, using logseq [[wikilinks]] naturally."
  (:require [clojure.string :as string]
            [frontend.context.i18n :refer [t]]
            [frontend.db :as db]
            [frontend.handler.route :as route-handler]
            [frontend.state :as state]
            [logseq.db :as ldb]
            [logseq.shui.hooks :as hooks]
            [logseq.shui.ui :as shui]
            [io.factorhouse.hsx.core :as hsx]))

;; ---------------------------------------------------------------------------
;; Research-signal detection
;; ---------------------------------------------------------------------------

(def ^:private signal-words
  #{"paper" "study" "research" "method" "hypothesis" "result" "analysis"
    "experiment" "dataset" "model" "literature" "review" "cite" "citation"
    "journal" "finding" "survey" "algorithm" "neural" "learning" "transformer"
    "attention" "embedding" "training" "inference" "baseline" "theorem"
    "abstract" "conclusion" "methodology" "proof" "arxiv" "doi"})

(defn- research-block? [text]
  (when (and text (> (count text) 35))
    (let [lower (string/lower-case text)
          words (set (string/split lower #"[\s.,!?;:()\[\]\"']+"))]
      (or (some signal-words words)
          (re-find #"(?i)(doi:|arxiv:|10\.\d{4}/|\[\[)" text)))))

(defn- keywords-from [text]
  (->> (string/split (string/lower-case text) #"[\s.,!?;:()\[\]\"']+")
       (filter #(> (count %) 3))
       (remove #{"this" "that" "with" "from" "have" "been" "they" "their"
                 "also" "when" "which" "would" "could" "should" "will"
                 "about" "these" "those" "other" "some" "into" "over"})
       (take 6)))

;; ---------------------------------------------------------------------------
;; Find related pages from the live DataScript DB
;; ---------------------------------------------------------------------------

(defn- related-pages-from-db [block-text]
  (let [kws  (set (keywords-from block-text))
        repo (state/get-current-repo)
        db   (when repo (db/get-db repo))]
    (when (and db (seq kws))
      (->> (ldb/get-pages db)
           (keep (fn [title]
                   (let [lower (string/lower-case (or title ""))
                         hits  (count (filter #(string/includes? lower %) kws))]
                     (when (pos? hits)
                       (let [page (db/get-page title)]
                         (when page
                           {:hits  hits
                            :uuid  (str (:block/uuid page))
                            :title title}))))))
           (sort-by :hits >)
           (take 4)))))

;; ---------------------------------------------------------------------------
;; Semantic Scholar URL
;; ---------------------------------------------------------------------------

(defn- scholar-url [text]
  (str "https://www.semanticscholar.org/search?q="
       (js/encodeURIComponent (string/join " " (take 4 (keywords-from text))))
       "&sort=Relevance"))

;; ---------------------------------------------------------------------------
;; Component
;; ---------------------------------------------------------------------------

(hsx/defc inline-research-panel
  [{:keys [block-text]}]
  (let [[visible? set-visible?!] (hooks/use-state true)
        [related  set-related!]  (hooks/use-state nil)]

    (hooks/use-effect!
     (fn []
       (when (research-block? block-text)
         (set-related! (related-pages-from-db block-text)))
       nil)
     [block-text])

    (when (and visible? (research-block? block-text))
      [:div.research-inline-panel
       [:div.research-inline-header
        (shui/tabler-icon "microscope" {:size 11 :class "opacity-40"})
        [:span (t :research.inline/related-title)]
        [:button.research-inline-dismiss
         {:on-click #(set-visible?! false)
          :title    (t :research.inline/dismiss)}
         (shui/tabler-icon "x" {:size 10})]]

       [:div.research-inline-chips
        (for [p (or related [])]
          [:button.research-inline-chip
           {:key      (:uuid p)
            :title    (:title p)
            :on-click #(route-handler/redirect-to-page! (:uuid p))}
           (shui/tabler-icon "notes" {:size 11 :class "shrink-0 opacity-60"})
           [:span.truncate (:title p)]])

        [:a.research-inline-chip.research-inline-chip--scholar
         {:href   (scholar-url block-text)
          :target "_blank"
          :rel    "noreferrer"
          :title  (t :research.inline/search-scholar)}
         (shui/tabler-icon "search" {:size 11 :class "shrink-0 opacity-60"})
         [:span (t :research.inline/search-scholar)]]]])))
