(ns frontend.components.research.paper-search
  "Paper search panel – queries Semantic Scholar open API and lets the user
   import a paper as a structured note."
  (:require [clojure.string :as string]
            [frontend.context.i18n :refer [t]]
            [frontend.handler.notification :as notification]
            [frontend.handler.page :as page-handler]
            [frontend.handler.route :as route-handler]
            [logseq.shui.hooks :as hooks]
            [logseq.shui.ui :as shui]
            [promesa.core :as p]
            [io.factorhouse.hsx.core :as hsx]))

;; ---------------------------------------------------------------------------
;; Semantic Scholar open-access search (no API key required)
;; ---------------------------------------------------------------------------

(defn- semantic-scholar-url [query limit]
  (str "https://api.semanticscholar.org/graph/v1/paper/search"
       "?query=" (js/encodeURIComponent query)
       "&limit=" (or limit 15)
       "&fields=paperId,title,abstract,authors,year,citationCount,externalIds,openAccessPdf,url"))

(defn search-papers!
  "Returns a promise resolving to a seq of paper maps, or nil on error."
  [query]
  (-> (js/fetch (semantic-scholar-url query 15)
                #js {:headers #js {"Accept" "application/json"}})
      (p/then (fn [^js resp] (when (.-ok resp) (.json resp))))
      (p/then (fn [^js data] (when data (js->clj (.-data data) :keywordize-keys true))))
      (p/catch (fn [_] nil))))

;; ---------------------------------------------------------------------------
;; Paper card component
;; ---------------------------------------------------------------------------

(hsx/defc paper-card
  [{:keys [paper on-import]}]
  (let [{:keys [title abstract authors year citationCount url openAccessPdf externalIds]} paper
        author-names (->> (or authors [])
                          (map #(get % :name ""))
                          (take 3)
                          (string/join ", "))
        doi (get externalIds :DOI)]
    [:div.paper-card
     [:div.flex.justify-between.gap-2
      [:div.flex-1.min-w-0
       [:h3.font-semibold.text-sm.text-foreground.leading-snug
        (if url
          [:a {:href url :target "_blank" :rel "noreferrer"} title]
          title)]
       [:p.text-xs.text-muted-foreground.mt-0.5
        (string/join " · "
          (remove string/blank?
                  [author-names
                   (when year (str year))
                   (when (and citationCount (pos? citationCount))
                     (str citationCount " citations"))]))]]
      [:div.flex.gap-1.shrink-0
       (when-let [pdf-url (get-in openAccessPdf [:url])]
         [:a.inline-flex.items-center.justify-center.rounded.p-1.hover:bg-accent
          {:href pdf-url :target "_blank" :rel "noreferrer"
           :title "Open PDF"}
          (shui/tabler-icon "file-type-pdf" {:size 14})])
       (shui/button
        {:variant :outline :size :sm
         :title (t :research.paper/import-as-note)
         :on-click #(on-import paper)}
        (shui/tabler-icon "notes" {:size 14 :class "mr-1"})
        (t :research.paper/import))]]
     (when (and abstract (not (string/blank? abstract)))
       [:p.text-xs.text-muted-foreground.mt-2.line-clamp-3 abstract])
     (when doi
       [:p.text-xs.text-blue-400.mt-1 (str "DOI: " doi)])]))

;; ---------------------------------------------------------------------------
;; Paper → note content generator
;; ---------------------------------------------------------------------------

(defn- paper->note-title [{:keys [title year]}]
  (str "Paper: " title (when year (str " (" year ")"))))

(defn- paper->first-block-text
  [{:keys [title abstract authors year url externalIds citationCount]}]
  (let [doi    (get externalIds :DOI)
        author-list (->> (or authors []) (map #(get % :name "")) (string/join ", "))]
    (string/join "\n"
      (remove nil?
        [(str "type:: [[Paper]]")
         (when (seq author-list) (str "authors:: " author-list))
         (when year              (str "year:: " year))
         (when doi               (str "doi:: " doi))
         (when url               (str "url:: " url))
         (when citationCount     (str "citations:: " citationCount))
         ""
         "## Abstract"
         ""
         (or abstract "")
         ""
         "## Key Insights"
         ""
         "- "
         ""
         "## Methods"
         ""
         "- "
         ""
         "## Relevance to My Research"
         ""
         "- "]))))

;; ---------------------------------------------------------------------------
;; Import a paper as a structured page
;; ---------------------------------------------------------------------------

(defn import-paper-as-note!
  "Creates a page for the paper and navigates to it."
  [paper]
  (let [title (paper->note-title paper)]
    (-> (page-handler/<create! title {:redirect? true :edit? false})
        (p/then (fn [page]
                  (when page
                    (notification/show! (t :research.paper/imported-success) :success))
                  page))
        (p/catch (fn [err]
                   (notification/show! (str "Import failed: " (.-message err)) :error))))))

;; ---------------------------------------------------------------------------
;; Paper search view
;; ---------------------------------------------------------------------------

(hsx/defc paper-search
  []
  (let [[query    set-query!]   (hooks/use-state "")
        [loading? set-loading?] (hooks/use-state false)
        [results  set-results!] (hooks/use-state nil)
        [error    set-error!]   (hooks/use-state nil)
        do-search! (fn []
                     (when-not (string/blank? query)
                       (set-loading? true)
                       (set-error! nil)
                       (-> (search-papers! query)
                           (p/then (fn [papers]
                                     (set-results! papers)
                                     (set-loading? false)))
                           (p/catch (fn [_]
                                      (set-error! (t :research.paper/search-error))
                                      (set-loading? false))))))]
    [:div.paper-search.p-6.max-w-3xl.mx-auto
     [:h1.text-2xl.font-bold.mb-1 (t :research/search-papers)]
     [:p.text-muted-foreground.text-sm.mb-5 (t :research.paper/search-hint)]

     ;; Search bar
     [:div.flex.gap-2.mb-6
      [:input.flex-1.rounded-lg.border.border-input.bg-background.px-3.py-2.text-sm
       {:type        "text"
        :placeholder (t :research.paper/search-placeholder)
        :value       query
        :on-change   #(set-query! (.. % -target -value))
        :on-key-down #(when (= "Enter" (.-key %)) (do-search!))}]
      (shui/button
       {:on-click do-search!
        :disabled loading?}
       (if loading?
         (shui/tabler-icon "loader-2" {:class "animate-spin" :size 15})
         (shui/tabler-icon "search" {:size 15 :class "mr-1.5"}))
       (t :research.paper/search-btn))]

     ;; Result states
     (cond
       error
       [:div.text-destructive.text-sm error]

       (and (nil? results) (not loading?))
       [:div.text-center.py-12.text-muted-foreground
        (shui/tabler-icon "books" {:size 48 :class "mx-auto mb-3 opacity-30"})
        [:p.text-sm (t :research.paper/search-empty-state)]]

       (and results (empty? results))
       [:div.text-center.py-12.text-muted-foreground
        [:p.text-sm (t :research.paper/no-results)]]

       :else
       [:div.flex.flex-col.gap-3
        (for [paper results]
          ^{:key (:paperId paper)}
          [paper-card {:paper paper :on-import import-paper-as-note!}])])]))
