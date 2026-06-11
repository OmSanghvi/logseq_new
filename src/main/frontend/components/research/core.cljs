(ns frontend.components.research.core
  "Research Hub — command center using rh- CSS namespace."
  (:require [clojure.string :as string]
            [frontend.components.research.ai-assistant :as ai]
            [frontend.context.i18n :refer [t]]
            [frontend.db :as db]
            [frontend.handler.notification :as notification]
            [frontend.handler.page :as page-handler]
            [frontend.handler.route :as route-handler]
            [frontend.state :as state]
            [logseq.db :as ldb]
            [logseq.shui.hooks :as hooks]
            [logseq.shui.ui :as shui]
            [promesa.core :as p]
            [reitit.frontend.easy :as rfe]
            [io.factorhouse.hsx.core :as hsx]))

;; ---------------------------------------------------------------------------
;; Helpers
;; ---------------------------------------------------------------------------

(defn- research-pages [repo]
  (when repo
    (let [db (db/get-db repo)]
      (when db
        (->> (ldb/get-pages db)
             (keep (fn [title]
                     (when (some #(string/starts-with? title %)
                                 ["Paper:" "Hypothesis:" "Connection:"
                                  "Draft:" "Idea:" "Research Log"])
                       (db/get-page title))))
             (remove nil?)
             (sort-by :block/updated-at >))))))

(defn- page-kind [title]
  (cond
    (string/starts-with? title "Paper:")        {:icon "◈" :color "#7fd88f" :label "Paper"}
    (string/starts-with? title "Hypothesis:")   {:icon "H" :color "#fbb73c" :label "Hypothesis"}
    (string/starts-with? title "Connection:")   {:icon "⟷" :color "#56b6c2" :label "Connection"}
    (string/starts-with? title "Draft:")        {:icon "✍" :color "#a78bfa" :label "Draft"}
    (string/starts-with? title "Research Log")  {:icon "📅" :color "#fab283" :label "Log"}
    :else                                        {:icon "≡" :color "#c4c4c4" :label "Note"}))

;; ---------------------------------------------------------------------------
;; Stats
;; ---------------------------------------------------------------------------

(hsx/defc stats-bar [pages]
  (let [by-type (group-by #(-> % :block/title page-kind :label) pages)]
    [:div.rh-stats
     (for [[label color] [["Paper" "#7fd88f"] ["Hypothesis" "#fbb73c"]
                           ["Connection" "#56b6c2"] ["Draft" "#a78bfa"]]]
       [:div {:key label :style {:display "contents"}}   ; ← fix here
        [:div.rh-stat
         [:span.rh-stat-val {:style {:color color}}
          (str (count (get by-type label [])))]
         [:span.rh-stat-lbl label]]
        [:div.rh-stat-sep]])
     [:div.rh-stat
      [:span.rh-stat-val (str (count pages))]
      [:span.rh-stat-lbl "Total"]]]))

;; ---------------------------------------------------------------------------
;; Workflow stages
;; ---------------------------------------------------------------------------

(hsx/defc stages []
  [:div.rh-section
   [:p.rh-section-label "Workflow"]
   [:div.rh-stages-grid
    [:a.rh-stage-card {:href (rfe/href :research/ideation)}
     [:div.rh-stage-icon {:style {:background "rgba(167,139,250,0.15)"}} "💡"]
     [:p.rh-stage-title "Ideation"]
     [:p.rh-stage-desc "Capture ideas, generate hypotheses with AI"]
     [:kbd.rh-stage-kbd "g r"]]

    [:a.rh-stage-card {:href (rfe/href :research/paper-search)}
     [:div.rh-stage-icon {:style {:background "rgba(127,216,143,0.15)"}} "📄"]
     [:p.rh-stage-title "Literature"]
     [:p.rh-stage-desc "Search and import papers from Semantic Scholar"]]

    [:a.rh-stage-card {:href (rfe/href :research/methods)}
     [:div.rh-stage-icon {:style {:background "rgba(251,183,60,0.15)"}} "🔬"]
     [:p.rh-stage-title "Methods"]
     [:p.rh-stage-desc "Design methodology and plan experiments"]]

    [:a.rh-stage-card {:href (rfe/href :research/writing)}
     [:div.rh-stage-icon {:style {:background "rgba(86,182,194,0.15)"}} "✍️"]
     [:p.rh-stage-title "Writing"]
     [:p.rh-stage-desc "Draft papers with AI writing feedback"]]]])

;; ---------------------------------------------------------------------------
;; Quick actions
;; ---------------------------------------------------------------------------

(hsx/defc quick-actions []
  (let [[busy set-busy!] (hooks/use-state nil)
        create! (fn [key title redirect?]
                  (set-busy! key)
                  (-> (page-handler/<create! title {:redirect? redirect? :edit? false})
                      (p/finally #(set-busy! nil))))]
    [:div.rh-section
     [:p.rh-section-label "Quick actions"]
     [:div.rh-actions-grid
      [:button.rh-action-btn
       {:disabled (= busy :log)
        :on-click #(create! :log
                    (str "Research Log — " (.toISOString.slice (js/Date.) 0 10))
                    true)}
       (shui/tabler-icon "calendar-plus" {:size 15})
       "Today's log"]

      [:button.rh-action-btn
       {:disabled (= busy :paper)
        :on-click #(create! :paper "Paper: " true)}
       (shui/tabler-icon "file-description" {:size 15})
       "New paper note"]

      [:button.rh-action-btn
       {:disabled (= busy :hyp)
        :on-click #(create! :hyp "Hypothesis: " true)}
       (shui/tabler-icon "bulb" {:size 15})
       "New hypothesis"]

      [:a.rh-action-btn {:href (rfe/href :research/paper-search)}
       (shui/tabler-icon "search" {:size 15})
       "Search papers"]

      [:a.rh-action-btn {:href (rfe/href :graph)}
       (shui/tabler-icon "hierarchy" {:size 15})
       "Knowledge graph"]

      [:a.rh-action-btn {:href (rfe/href :research/writing)}
       (shui/tabler-icon "writing" {:size 15})
       "Start writing"]]]))

;; ---------------------------------------------------------------------------
;; AI connection finder (inline on the hub)
;; ---------------------------------------------------------------------------

(hsx/defc ai-connection-finder []
  (let [[query    set-query!]   (hooks/use-state "")
        [loading? set-loading?] (hooks/use-state false)
        [result   set-result!]  (hooks/use-state nil)
        [preview  set-preview!] (hooks/use-state nil)

        quick-prompts ["Find connections in my notes"
                       "Suggest related papers"
                       "Generate hypotheses"
                       "What gaps exist in my research?"]

        run! (fn [q]
               (when (seq (string/trim q))
                 (set-loading? true)
                 (set-result! nil)
                 (set-preview! nil)
                 (-> (ai/call-llm!
                      (str "You are a research assistant helping build a knowledge graph. "
                           "Based on this query, provide a helpful, concise response (3-5 sentences). "
                           "Then suggest one specific Markdown page to create that would add value to "
                           "the researcher's graph. Format the page suggestion as:\n"
                           "PAGE: <title> | <2-sentence content summary>\n\n"
                           "Query: " q))
                     (p/then (fn [text]
                               (when text
                                 (let [lines     (string/split text #"\n")
                                       page-line (some #(when (string/starts-with? % "PAGE:") %) lines)
                                       summary   (->> lines
                                                      (remove #(string/starts-with? % "PAGE:"))
                                                      (string/join "\n")
                                                      string/trim)]
                                   (set-result! summary)
                                   (when page-line
                                     (let [parts (string/split (subs page-line 5) #"\|")]
                                       (set-preview! {:title   (string/trim (nth parts 0 ""))
                                                      :summary (string/trim (nth parts 1 ""))})))
                                   (set-loading? false))))
                     (p/catch (fn [_]
                                (set-result! "AI unavailable. Configure your LLM in the Ideation panel.")
                                (set-loading? false)))))))]

    [:div.rh-ai-panel
     [:div.rh-section-label "AI research assistant"]
     ;; Input row
     [:div.rh-ai-input-row
      [:input
       {:type        "text"
        :value       query
        :placeholder "Ask about your research, find connections, generate ideas…"
        :on-change   #(set-query! (.. % -target -value))
        :on-key-down #(when (= "Enter" (.-key %)) (run! query))}]
      [:button.rh-ai-find-btn
       {:on-click #(run! query)
        :disabled loading?}
       (if loading?
         [:span.rh-spin (shui/tabler-icon "loader-2" {:size 14})]
         (shui/tabler-icon "sparkles" {:size 14}))
       (if loading? "Thinking…" "Ask")]]

     ;; Quick prompt chips
     [:div.rh-ai-chips
      (for [p quick-prompts]
        [:button.rh-ai-chip
         {:key      p
          :on-click #(do (set-query! p) (run! p))}
         p])]

     ;; Loading indicator
     (when loading?
       [:div.rh-ai-loading
        [:span.rh-spin (shui/tabler-icon "loader-2" {:size 13})]
        "Analysing your research context…"])

     ;; Result
     (when result
       [:div.rh-ai-result
        [:p.rh-ai-result-summary result]

        ;; Page preview
        (when preview
          [:div.rh-md-preview
           (str "# " (:title preview) "\n\n"
                "type:: [[Note]]\n\n"
                "## Summary\n\n"
                (:summary preview) "\n\n"
                "## Connections\n\n"
                "- Related to [[Research]]\n")])

        [:div.rh-ai-result-actions
         (when preview
           [:button.rh-result-btn
            {:on-click (fn []
                         (-> (page-handler/<create! (:title preview)
                               {:redirect? true :edit? false})
                             (p/then #(notification/show!
                                       (str "Created [[" (:title preview) "]]")
                                       :success))))}
            (shui/tabler-icon "notes-plus" {:size 13})
            "Create this page"])

         [:button.rh-result-btn
          {:on-click #(do (set-result! nil) (set-preview! nil) (set-query! ""))}
          (shui/tabler-icon "x" {:size 13})
          "Clear"]]])]))

;; ---------------------------------------------------------------------------
;; Recent research pages
;; ---------------------------------------------------------------------------

(hsx/defc recent-pages [pages]
  (when (seq pages)
    [:div.rh-section
     [:div.rh-section-header
      [:p.rh-section-label "Recent research"]
      [:a.rh-view-all {:href (rfe/href :all-pages)} "View all →"]]
     [:div.rh-recent-grid
      (for [page (take 8 pages)]
        (let [title (:block/title page)
              uuid  (str (:block/uuid page))
              kind  (page-kind title)]
          [:button.rh-recent-card
           {:key      uuid
            :on-click #(route-handler/redirect-to-page! uuid)}
           [:div.rh-recent-badge
            {:style {:background (str (:color kind) "22")
                     :color      (:color kind)}}
            (:icon kind)]
           [:div.rh-recent-info
            [:p.rh-recent-title title]
            [:p.rh-recent-meta (:label kind)]]]))]]))

;; ---------------------------------------------------------------------------
;; Graph preview panel (shows recent connections)
;; ---------------------------------------------------------------------------

(hsx/defc graph-preview [pages]
  (let [connections (->> pages
                         (filter #(string/starts-with? (:block/title %) "Connection:"))
                         (take 4))]
    [:div.rh-graph-panel
     [:p.rh-section-label "Knowledge graph"]
     ;; Mini graph placeholder
     [:div.rh-graph-canvas
      [:div {:style {:display "flex" :align-items "center" :justify-content "center"
                     :height "100%" :flex-direction "column" :gap "8px"}}
       (shui/tabler-icon "circles-relation"
                         {:size 32 :class "opacity-20"})
       [:p {:style {:font-size "12px" :color "var(--ls-secondary-text-color)"}}
        (str (count pages) " nodes")]]]

     ;; Recent connections
     (when (seq connections)
       [:div.rh-conn-list
        (for [c connections]
          (let [title (:block/title c)
                parts (string/split (string/replace-first title "Connection: " "") #"→")]
            [:div.rh-conn-item {:key (str (:block/uuid c))}
             [:span.rh-conn-from (string/trim (nth parts 0 title))]
             [:span.rh-conn-arrow "→"]
             [:span.rh-conn-to (string/trim (nth parts 1 "…"))]]))])

     [:div.rh-graph-footer
      [:span (str (count pages) " research nodes")]
      [:a.rh-graph-link {:href (rfe/href :graph)} "Open full graph →"]]]))

;; ---------------------------------------------------------------------------
;; Research hub root
;; ---------------------------------------------------------------------------

(hsx/defc research-home []
  (let [repo  (state/use-sub :git/current-repo)
        pages (research-pages repo)]
    [:div.rh-root

     ;; Hero
     [:div.rh-hero
      [:div
       [:h1.rh-hero-title "Research IDE"]
       [:p.rh-hero-sub
        "AI-powered research platform. Write notes, import papers, "
        "discover connections. Everything links back to your graph with "
        [:code "[[wikilinks]]"] "."]]
      (stats-bar pages)]

     ;; Workflow stages
     (stages)

     ;; Quick actions
     (quick-actions)

     ;; Two-column: AI finder + graph preview
     [:div.rh-two-col
      (ai-connection-finder)
      (graph-preview pages)]

     ;; Recent pages
     (recent-pages pages)]))
