(ns frontend.components.research.paper-search
  "Semantic Scholar paper search — find papers and import them as linked
   Markdown pages that appear as nodes in the knowledge graph."
  (:require [clojure.string :as string]
            [frontend.context.i18n :refer [t]]
            [frontend.handler.notification :as notification]
            [frontend.handler.page :as page-handler]
            [logseq.shui.hooks :as hooks]
            [logseq.shui.ui :as shui]
            [promesa.core :as p]
            [io.factorhouse.hsx.core :as hsx]))

;; ---------------------------------------------------------------------------
;; Semantic Scholar API
;; ---------------------------------------------------------------------------

(defn search-papers! [query]
  (-> (js/fetch
       (str "https://api.semanticscholar.org/graph/v1/paper/search"
            "?query=" (js/encodeURIComponent query)
            "&limit=12"
            "&fields=paperId,title,abstract,authors,year,citationCount,externalIds,openAccessPdf,url,venue")
       #js {:headers #js {"Accept" "application/json"}})
      (p/then (fn [^js r] (when (.-ok r) (.json r))))
      (p/then (fn [^js d] (when d (js->clj (.-data d) :keywordize-keys true))))
      (p/catch (fn [_] nil))))

;; ---------------------------------------------------------------------------
;; Import paper as a linked page
;; ---------------------------------------------------------------------------

(defn- import-paper! [paper]
  (let [{:keys [title abstract authors year externalIds url openAccessPdf venue citationCount]} paper
        doi        (get externalIds :DOI)
        author-str (->> (or authors []) (map #(get % :name "")) (take 4) (string/join ", "))
        page-title (str "Paper: " title (when year (str " (" year ")")))
        content    (str "type:: [[Paper]]\n"
                        "authors:: " author-str "\n"
                        (when year    (str "year:: " year "\n"))
                        (when doi     (str "doi:: " doi "\n"))
                        (when venue   (str "venue:: " venue "\n"))
                        (when citationCount (str "citations:: " citationCount "\n"))
                        (when url     (str "url:: " url "\n"))
                        (when-let [pdf (get openAccessPdf :url)]
                          (str "pdf:: " pdf "\n"))
                        "\n## Abstract\n\n"
                        (or abstract "") "\n\n"
                        "## Key insights\n\n- \n\n"
                        "## Methods\n\n- \n\n"
                        "## Relevance to my research\n\n- \n\n"
                        "## Connections\n\n"
                        "- Related to [[Research]]\n")]
    (-> (page-handler/<create! page-title {:redirect? false :edit? false})
        (p/then (fn [_]
                  (notification/show! (str "Imported → [[" page-title "]]") :success)))
        (p/catch (fn [e]
                   (notification/show! (str "Import failed: " (.-message e)) :error))))))

;; ---------------------------------------------------------------------------
;; Paper card
;; ---------------------------------------------------------------------------

(hsx/defc paper-card [{:keys [paper]}]
  (let [[importing? set-importing?!] (hooks/use-state false)
        [expanded?  set-expanded?!]  (hooks/use-state false)
        {:keys [title abstract authors year citationCount url openAccessPdf externalIds venue]} paper
        doi         (get externalIds :DOI)
        author-str  (->> (or authors []) (map #(get % :name "")) (take 3) (string/join ", "))]
    [:div.paper-card
     ;; Header
     [:div.paper-card-header
      [:div.paper-card-meta
       (when year [:span.paper-year year])
       (when venue [:span.paper-venue venue])
       (when (and citationCount (pos? citationCount))
         [:span.paper-citations (str citationCount " citations")])]
      [:div.paper-card-actions
       (when-let [pdf-url (get openAccessPdf :url)]
         [:a.paper-action-link
          {:href pdf-url :target "_blank" :rel "noreferrer" :title "Open PDF"}
          (shui/tabler-icon "file-type-pdf" {:size 14})])
       (when url
         [:a.paper-action-link
          {:href url :target "_blank" :rel "noreferrer" :title "Open paper"}
          (shui/tabler-icon "external-link" {:size 14})])]]

     ;; Title
     [:h3.paper-title title]
     [:p.paper-authors author-str]

     ;; Abstract (expandable)
     (when abstract
       [:div.paper-abstract-wrap
        [:p.paper-abstract
         {:class (when-not expanded? "line-clamp-3")}
         abstract]
        (when (> (count abstract) 200)
          [:button.paper-expand-btn
           {:on-click #(set-expanded?! (not expanded?))}
           (if expanded? "Show less ↑" "Show more ↓")])])

     (when doi [:p.paper-doi (str "DOI: " doi)])

     ;; Import button
     (shui/button
      {:size     :sm
       :class    "paper-import-btn gap-1.5"
       :disabled importing?
       :on-click (fn []
                   (set-importing?! true)
                   (-> (import-paper! paper)
                       (p/finally (fn [] (set-importing?! false)))))}
      (if importing?
        (shui/tabler-icon "loader-2" {:size 13 :class "animate-spin"})
        (shui/tabler-icon "notes-plus" {:size 13}))
      (if importing? "Importing…" "Import as page"))]))

;; ---------------------------------------------------------------------------
;; Search view
;; ---------------------------------------------------------------------------

(hsx/defc paper-search []
  (let [[query    set-query!]   (hooks/use-state "")
        [loading? set-loading?] (hooks/use-state false)
        [results  set-results!] (hooks/use-state nil)
        [error    set-error!]   (hooks/use-state nil)

        do-search! (fn []
                     (when (seq (string/trim query))
                       (set-loading? true)
                       (set-error! nil)
                       (-> (search-papers! query)
                           (p/then (fn [papers]
                                     (set-results! (or papers []))
                                     (set-loading? false)))
                           (p/catch (fn [_]
                                      (set-error! "Search failed. Check your connection.")
                                      (set-loading? false))))))]

    [:div.paper-search
     ;; Header
     [:div.paper-search-header
      [:h1.paper-search-title "Search Papers"]
      [:p.paper-search-sub
       "Search 200M+ papers from Semantic Scholar. Import any paper as a linked page in your graph."]]

     ;; Search bar
     [:div.paper-search-bar
      [:input.paper-search-input
       {:type        "text"
        :placeholder "Search by title, author, topic, keywords…"
        :value       query
        :on-change   #(set-query! (.. % -target -value))
        :on-key-down #(when (= "Enter" (.-key %)) (do-search!))}]
      (shui/button
       {:on-click do-search!
        :disabled loading?
        :class    "paper-search-btn gap-1.5"}
       (if loading?
         (shui/tabler-icon "loader-2" {:size 15 :class "animate-spin"})
         (shui/tabler-icon "search" {:size 15}))
       (if loading? "Searching…" "Search"))]

     ;; States
     (cond
       error
       [:div.paper-search-error error]

       (and (nil? results) (not loading?))
       [:div.paper-search-empty
        (shui/tabler-icon "books" {:size 48 :class "paper-empty-icon"})
        [:p "Search for papers to build your knowledge graph"]
        [:p.paper-empty-hint "Imported papers appear as [[linked pages]] in your notes"]]

       (and results (empty? results))
       [:div.paper-search-empty
        [:p "No papers found — try different keywords"]]

       :else
       [:div.paper-results-grid
        (for [p results]
          ^{:key (:paperId p)}
          [paper-card {:paper p}])])]))
