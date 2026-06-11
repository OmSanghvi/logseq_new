(ns frontend.components.research.paper-search
  "OpenAlex paper search — find papers and import them as linked
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
;; OpenAlex API
;; ---------------------------------------------------------------------------

(defn- reconstruct-abstract [inverted-index]
  (when (and inverted-index (map? inverted-index))
    (let [pairs (for [[word positions] inverted-index
                      pos positions]
                  [pos (name word)])
          sorted (sort-by first pairs)]
      (string/join " " (map second sorted)))))

(defn- paper-authors [authorships]
  (->> (or authorships [])
       (map #(get-in % [:author :display_name] ""))
       (remove string/blank?)
       (take 4)
       (string/join ", ")))

(defn search-papers! [query]
  (-> (js/fetch
       (str "https://api.openalex.org/works"
            "?search=" (js/encodeURIComponent query)
            "&per-page=12"
            "&select=id,title,abstract_inverted_index,authorships,"
            "publication_year,cited_by_count,doi,open_access,"
            "primary_location,biblio")
       #js {:headers #js {"Accept"     "application/json"
                          "User-Agent" "LogseqResearch/1.0"}})
      (p/then (fn [^js r]
                (if (.-ok r)
                  (.json r)
                  (throw (js/Error. (str "HTTP " (.-status r)))))))
      (p/then (fn [^js d]
                (when d
                  (let [results (aget d "results")]
                    (when results
                      (js->clj results :keywordize-keys true))))))
      (p/catch (fn [e]
                 (js/console.error "Search error:" e)
                 nil))))

;; ---------------------------------------------------------------------------
;; Import paper as a linked page
;; ---------------------------------------------------------------------------

(defn- import-paper! [paper]
  (let [{:keys [title abstract_inverted_index authorships
                publication_year cited_by_count doi
                open_access primary_location]} paper
        abstract    (reconstruct-abstract abstract_inverted_index)
        author-str  (paper-authors authorships)
        year        publication_year
        url         (get-in primary_location [:landing_page_url])
        pdf-url     (get-in open_access [:oa_url])
        venue       (get-in primary_location [:source :display_name])
        page-title  (str "Paper: " title (when year (str " (" year ")")))
        content     (str "type:: [[Paper]]\n"
                         "authors:: " author-str "\n"
                         (when year         (str "year:: " year "\n"))
                         (when doi          (str "doi:: " doi "\n"))
                         (when venue        (str "venue:: " venue "\n"))
                         (when cited_by_count (str "citations:: " cited_by_count "\n"))
                         (when url          (str "url:: " url "\n"))
                         (when pdf-url      (str "pdf:: " pdf-url "\n"))
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
        {:keys [title abstract_inverted_index authorships
                publication_year cited_by_count doi
                open_access primary_location]}  paper
        abstract   (reconstruct-abstract abstract_inverted_index)
        author-str (paper-authors authorships)
        year       publication_year
        url        (get-in primary_location [:landing_page_url])
        pdf-url    (get-in open_access [:oa_url])
        venue      (get-in primary_location [:source :display_name])]
    [:div.paper-card
     ;; Header
     [:div.paper-card-header
      [:div.paper-card-meta
       (when year [:span.paper-year year])
       (when (seq venue) [:span.paper-venue venue])
       (when (and cited_by_count (pos? cited_by_count))
         [:span.paper-citations (str cited_by_count " citations")])]
      [:div.paper-card-actions
       (when (seq pdf-url)
         [:a.paper-action-link
          {:href pdf-url :target "_blank" :rel "noreferrer" :title "Open PDF"}
          (shui/tabler-icon "file-type-pdf" {:size 14})])
       (when (seq url)
         [:a.paper-action-link
          {:href url :target "_blank" :rel "noreferrer" :title "Open paper"}
          (shui/tabler-icon "external-link" {:size 14})])]]

     ;; Title
     [:h3.paper-title (or title "Untitled")]
     [:p.paper-authors author-str]

     ;; Abstract (expandable)
     (when (seq abstract)
       [:div.paper-abstract-wrap
        [:p.paper-abstract
         {:class (when-not expanded? "line-clamp-3")}
         abstract]
        (when (> (count abstract) 200)
          [:button.paper-expand-btn
           {:on-click #(set-expanded?! (not expanded?))}
           (if expanded? "Show less ↑" "Show more ↓")])])

     (when (seq doi)
       [:p.paper-doi (str "DOI: " doi)])

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
                                      (set-error! "Search failed. Check your connection and try again.")
                                      (set-loading? false))))))]

    [:div.paper-search
     ;; Header
     [:div.paper-search-header
      [:h1.paper-search-title "Search Papers"]
      [:p.paper-search-sub
       "Search 250M+ papers from OpenAlex. Import any paper as a linked page in your graph."]]

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
          [:div {:key (:id p)}
           [paper-card {:paper p}]])])]))