(ns frontend.components.research.inline-panel
  "Inline research panel — appears natively below a block when it contains
   research-relevant content. Shows:
   - Related papers from the KOVA store matching the block's keywords
   - A one-click 'Search Semantic Scholar' shortcut
   - AI insight badges already discovered for related nodes

   Rendered inside block.cljs's block-content-or-editor-wrap so it is
   part of the normal block flow, not a separate panel."
  (:require [clojure.string :as string]
            [frontend.context.i18n :refer [t]]
            [frontend.handler.route :as route-handler]
            [frontend.state :as state]
            [logseq.shui.hooks :as hooks]
            [logseq.shui.ui :as shui]
            [reitit.frontend.easy :as rfe]
            [io.factorhouse.hsx.core :as hsx]))

;; ---------------------------------------------------------------------------
;; KOVA store reader
;; ---------------------------------------------------------------------------

(def ^:private kova-key "kova-graph-v2")

(defn- read-kova-nodes []
  (when (exists? js/localStorage)
    (try
      (let [raw (.getItem js/localStorage kova-key)]
        (when raw
          (-> raw js/JSON.parse (js->clj :keywordize-keys true) :nodes)))
      (catch :default _ nil))))

;; ---------------------------------------------------------------------------
;; Keyword extraction from block text
;; ---------------------------------------------------------------------------

(def ^:private research-signal-words
  #{"study" "paper" "research" "method" "hypothesis" "result" "analysis"
    "experiment" "dataset" "model" "literature" "review" "cite" "citation"
    "journal" "finding" "survey" "algorithm" "neural" "learning" "transformer"
    "attention" "embedding" "corpus" "inference" "training" "baseline"})

(defn- extract-keywords
  "Extracts meaningful words from block text, filters stop words."
  [text]
  (->> (string/split (string/lower-case text) #"[\s,.\[\]\(\)\"'!?;:]+")
       (filter #(> (count %) 3))
       (remove #{"this" "that" "with" "from" "have" "been" "they" "their"
                 "also" "when" "which" "would" "could" "should" "will"})
       (take 8)
       set))

(defn- research-relevant?
  "Returns true if block text contains enough research signal to warrant showing the panel."
  [text]
  (when (and text (> (count text) 40))
    (let [words (extract-keywords text)]
      (or (some research-signal-words words)
          ;; DOI or arXiv patterns
          (re-find #"(?i)(doi:|arxiv:|10\.\d{4}/)" text)
          ;; [[wikilink]] references (common in research notes)
          (> (count (re-seq #"\[\[" text)) 1)))))

;; ---------------------------------------------------------------------------
;; Paper matching against KOVA store
;; ---------------------------------------------------------------------------

(defn- score-node
  "Returns a relevance score for a KOVA node against the given keywords."
  [keywords {:keys [title tags content type]}]
  (let [node-text (string/lower-case (str title " " (string/join " " tags) " "
                                          (subs (or content "") 0 200)))
        keyword-hits (count (filter #(string/includes? node-text %) keywords))
        type-bonus (if (#{"paper" "synthesis"} type) 1 0)]
    (+ keyword-hits type-bonus)))

(defn- find-related-nodes
  "Returns up to 4 KOVA nodes most relevant to the given block text."
  [block-text]
  (let [keywords (extract-keywords block-text)
        nodes    (read-kova-nodes)]
    (->> nodes
         (map (fn [n] (assoc n :score (score-node keywords n))))
         (filter #(pos? (:score %)))
         (sort-by :score >)
         (take 4))))

;; ---------------------------------------------------------------------------
;; Semantic Scholar quick-search URL
;; ---------------------------------------------------------------------------

(defn- scholar-url [query]
  (str "https://www.semanticscholar.org/search?q="
       (js/encodeURIComponent query)
       "&sort=Relevance"))

;; ---------------------------------------------------------------------------
;; Related-node chip
;; ---------------------------------------------------------------------------

(def ^:private type->icon
  {"paper"      "file-description"
   "synthesis"  "sparkles"
   "url"        "link"
   "pdf"        "file-type-pdf"
   "query"      "help-circle"
   "text"       "notes"
   "annotation" "pencil"})

(hsx/defc related-chip
  [{:keys [node on-open-graph]}]
  (let [{:keys [type title year authors]} node
        icon (get type->icon type "notes")
        short-title (if (> (count title) 45) (str (subs title 0 42) "…") title)]
    [:button.research-inline-chip
     {:title title
      :on-click on-open-graph}
     (shui/tabler-icon icon {:size 12 :class "shrink-0 opacity-70"})
     [:span.truncate short-title]
     (when year [:span.opacity-50.shrink-0.ml-1 (str year)])]))

;; ---------------------------------------------------------------------------
;; Main inline panel
;; ---------------------------------------------------------------------------

(hsx/defc inline-research-panel
  "Renders below a block when research context is detected.
   `block-text` — the plain-text content of the block."
  [{:keys [block-text]}]
  (let [[related set-related!] (hooks/use-state nil)
        [visible? set-visible?!] (hooks/use-state true)

        open-graph! (fn []
                      ;; Navigate to the research graph route
                      (set! js/window.location.hash (rfe/href :research/graph)))]

    ;; Compute related nodes whenever block-text changes (debounced by React batching)
    (hooks/use-effect!
     (fn []
       (when (research-relevant? block-text)
         (set-related! (find-related-nodes block-text)))
       nil)
     [block-text])

    (when (and visible? (seq related))
      [:div.research-inline-panel
       [:div.research-inline-header
        (shui/tabler-icon "microscope" {:size 12 :class "opacity-50"})
        [:span (t :research.inline/related-title)]
        ;; Dismiss button
        [:button.research-inline-dismiss
         {:on-click #(set-visible?! false)
          :title (t :research.inline/dismiss)}
         (shui/tabler-icon "x" {:size 11})]]

       [:div.research-inline-chips
        (for [node related]
          ^{:key (:id node)}
          [related-chip {:node node :on-open-graph open-graph!}])

        ;; Scholar quick-search
        (let [first-keywords (->> (extract-keywords block-text) (take 4) (string/join " "))]
          [:a.research-inline-chip.research-inline-chip--scholar
           {:href   (scholar-url first-keywords)
            :target "_blank"
            :rel    "noreferrer"
            :title  (t :research.inline/search-scholar)}
           (shui/tabler-icon "search" {:size 12 :class "shrink-0 opacity-70"})
           [:span (t :research.inline/search-scholar)]])]])))
