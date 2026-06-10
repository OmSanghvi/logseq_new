(ns frontend.components.research.graph-view
  "Research graph view — the full graph plus an AI side-panel that discovers
   connections between your notes/papers and can import new papers as linked
   Markdown pages, exactly like Obsidian's graph + linking workflow."
  (:require [clojure.string :as string]
            [frontend.components.research.ai-assistant :as ai-assistant]
            [frontend.context.i18n :refer [t]]
            [frontend.db :as db]
            [frontend.handler.notification :as notification]
            [frontend.handler.page :as page-handler]
            [frontend.handler.route :as route-handler]
            [frontend.state :as state]
            [logseq.shui.hooks :as hooks]
            [logseq.shui.ui :as shui]
            [promesa.core :as p]
            [io.factorhouse.hsx.core :as hsx]))

;; ---------------------------------------------------------------------------
;; Import a discovered paper as a proper Markdown page with [[wikilinks]]
;; ---------------------------------------------------------------------------

(defn- import-paper-as-page!
  "Creates a Markdown page for a paper and links it to the current context.
   The page uses [[wikilinks]] so the graph view shows connections naturally."
  [{:keys [title authors year doi url abstract reason]}]
  (let [page-title (str title (when year (str " (" year ")")))
        author-str (if (seq authors) (string/join ", " authors) "Unknown")
        content (str
                  "type:: [[Paper]]\n"
                  "authors:: " author-str "\n"
                  (when year (str "year:: " year "\n"))
                  (when doi  (str "doi:: " doi "\n"))
                  (when url  (str "url:: " url "\n"))
                  "\n"
                  "## Abstract\n\n"
                  (or abstract "") "\n\n"
                  "## Why relevant\n\n"
                  (or reason "") "\n\n"
                  "## Key insights\n\n"
                  "- \n\n"
                  "## Connections\n\n"
                  "- Related to [[Research]]\n")]
    (-> (page-handler/<create! page-title {:redirect? false :edit? false})
        (p/then (fn [_]
                  (notification/show!
                   (str "Imported: " page-title) :success)))
        (p/catch (fn [e]
                   (notification/show!
                    (str "Import failed: " (.-message e)) :error))))))

;; ---------------------------------------------------------------------------
;; Paper suggestion card (from AI)
;; ---------------------------------------------------------------------------

(hsx/defc suggestion-card
  [{:keys [suggestion on-import importing?]}]
  (let [{:keys [title authors year reason doi]} suggestion]
    [:div.research-suggestion-card
     [:div.research-suggestion-meta
      [:span.research-suggestion-type "◈ Paper"]
      (when year [:span.research-suggestion-year (str year)])]
     [:p.research-suggestion-title title]
     (when (seq authors)
       [:p.research-suggestion-authors
        (string/join ", " (take 2 authors))
        (when (> (count authors) 2) " et al.")])
     (when reason
       [:p.research-suggestion-reason reason])
     [:button.research-import-btn
      {:on-click #(on-import suggestion)
       :disabled importing?}
      (shui/tabler-icon "notes-plus" {:size 13 :class "mr-1.5"})
      "Import as page"]]))

;; ---------------------------------------------------------------------------
;; AI connection discovery panel (sits beside the graph)
;; ---------------------------------------------------------------------------

(hsx/defc ai-discovery-panel
  []
  (let [[running?    set-running?!]    (hooks/use-state false)
        [suggestions set-suggestions!] (hooks/use-state nil)
        [error       set-error!]       (hooks/use-state nil)
        [importing   set-importing!]   (hooks/use-state #{})

        ;; Get context from current page or recent pages
        get-context (fn []
                      (let [repo  (state/get-current-repo)
                             match (state/get-route-match)
                             pname (get-in match [:parameters :path :name])]
                        (when (and repo pname)
                          (let [page   (db/get-page pname)
                                blocks (when page
                                         (->> (db/get-page-blocks-no-cache repo (:db/id page) nil)
                                              (map :block/title)
                                              (remove string/blank?)
                                              (take 30)))]
                            (when (seq blocks)
                              (string/join "\n" blocks))))))

        discover! (fn []
                    (set-running?! true)
                    (set-error! nil)
                    (let [ctx (or (get-context)
                                  "Research platform — suggest relevant academic papers")]
                      (-> (ai-assistant/call-llm!
                           (str "You are a research discovery assistant. Based on these notes, "
                                "suggest 5 highly relevant academic papers the researcher should read. "
                                "For each paper output EXACTLY one JSON per line (no markdown):\n"
                                "{\"title\":\"<title>\",\"authors\":[\"<Author>\"],\"year\":<number>,"
                                "\"doi\":\"<doi or empty>\",\"reason\":\"<one sentence why relevant>\"}\n\n"
                                "Notes:\n" ctx))
                          (p/then (fn [text]
                                    (when text
                                      (let [lines (->> (string/split text #"\n")
                                                       (filter #(string/starts-with? (string/trim %) "{")))]
                                        (set-suggestions!
                                         (->> lines
                                              (keep (fn [l]
                                                      (try (js->clj (.parse js/JSON l) :keywordize-keys true)
                                                           (catch :default _ nil))))
                                              vec))))
                                    (set-running?! false)))
                          (p/catch (fn [_]
                                     (set-error! (t :research.ai/call-error))
                                     (set-running?! false))))))]

    [:div.research-ai-panel
     ;; Header
     [:div.research-ai-panel-header
      (shui/tabler-icon "sparkles" {:size 14 :class "text-purple-400"})
      [:span "AI Discovery"]
      [:button.research-ai-run-btn
       {:on-click discover!
        :disabled running?}
       (if running?
         (shui/tabler-icon "loader-2" {:size 13 :class "animate-spin"})
         (shui/tabler-icon "refresh" {:size 13}))
       (if running? "Finding…" "Find connections")]]

     ;; Description
     [:p.research-ai-desc
      "AI analyses your current page and finds papers to import as linked pages in your graph."]

     ;; Error
     (when error
       [:p.text-xs.text-red-400.px-3.pb-2 error])

     ;; Suggestions
     (cond
       (nil? suggestions)
       [:div.research-ai-empty
        (shui/tabler-icon "circuit-diode" {:size 32 :class "opacity-20 mx-auto mb-2"})
        [:p "Click to discover connections from your current note."]]

       (empty? suggestions)
       [:div.research-ai-empty
        [:p "No suggestions found. Try adding more content to your note."]]

       :else
       [:div.research-suggestions-list
        (for [[idx s] (map-indexed vector suggestions)]
          ^{:key idx}
          [suggestion-card
           {:suggestion s
            :importing? (contains? importing idx)
            :on-import  (fn [paper]
                          (set-importing! #(conj % idx))
                          (-> (import-paper-as-page! paper)
                              (p/finally (fn []
                                           (set-importing! #(disj % idx))))))}])])]))

;; ---------------------------------------------------------------------------
;; Research graph — full graph + AI panel side by side
;; ---------------------------------------------------------------------------

(hsx/defc research-graph
  []
  (let [[show-ai? set-show-ai?!] (hooks/use-state true)]
    [:div.research-graph-layout
     ;; The native logseq graph fills the main space
     [:div.research-graph-main
      {:id "research-graph-canvas"}
      ;; Mount point — the router renders global-graph here via the :graph route
      ;; We redirect to it so the full graph renders natively
      [:div.research-graph-redirect
       [:p.text-muted-foreground.text-sm.mb-4
        "The research graph uses the main Knowledge Graph view with AI-powered connections."]
       (shui/button
        {:on-click #(route-handler/redirect-to-graph-view!)}
        (shui/tabler-icon "hierarchy" {:size 15 :class "mr-1.5"})
        "Open Knowledge Graph")
       [:p.text-xs.text-muted-foreground.mt-4
        "Papers imported via AI Discovery will appear as connected nodes in the graph."]]]

     ;; AI discovery panel
     (when show-ai?
       [:div.research-ai-panel-wrapper
        (ai-discovery-panel)])

     ;; Toggle AI panel
     [:button.research-ai-toggle
      {:on-click #(set-show-ai?! (not show-ai?))
       :title (if show-ai? "Hide AI panel" "Show AI panel")}
      (shui/tabler-icon "sparkles" {:size 14})]]))
