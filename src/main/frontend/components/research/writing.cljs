(ns frontend.components.research.writing
  "Writing workspace — compose research papers with AI feedback,
   section-by-section guidance, and one-click export to Markdown pages
   that link back into the knowledge graph."
  (:require [clojure.string :as string]
            [frontend.components.research.ai-assistant :as ai]
            [frontend.context.i18n :refer [t]]
            [frontend.handler.notification :as notification]
            [frontend.handler.page :as page-handler]
            [frontend.handler.route :as route-handler]
            [logseq.shui.hooks :as hooks]
            [logseq.shui.ui :as shui]
            [promesa.core :as p]
            [io.factorhouse.hsx.core :as hsx]))

;; ---------------------------------------------------------------------------
;; Templates
;; ---------------------------------------------------------------------------

(def ^:private templates
  {:paper
   {:name     "Research Paper"
    :icon     "◈"
    :sections ["Abstract" "Introduction" "Related Work"
               "Methodology" "Results" "Discussion"
               "Conclusion" "References"]}
   :review
   {:name     "Literature Review"
    :icon     "≡"
    :sections ["Introduction" "Search Strategy" "Thematic Analysis"
               "Critical Evaluation" "Research Gaps" "Conclusion"]}
   :proposal
   {:name     "Research Proposal"
    :icon     "◎"
    :sections ["Problem Statement" "Research Questions" "Objectives"
               "Methodology" "Timeline" "Expected Outcomes"]}
   :notes
   {:name     "Reading Notes"
    :icon     "✎"
    :sections ["Citation" "Summary" "Key Contributions"
               "Methodology" "Strengths" "Limitations"
               "Relevance to My Research"]}})

;; ---------------------------------------------------------------------------
;; Section outline
;; ---------------------------------------------------------------------------

(hsx/defc section-outline
  [{:keys [template-key active-section on-select]}]
  (let [sections (get-in templates [template-key :sections] [])]
    [:div.writing-outline
     [:p.writing-outline-title "Outline"]
     (for [s sections]
       [:button.writing-outline-item
        {:key      s
         :class    (when (= s active-section) "active")
         :on-click #(on-select s)}
        s])]))

;; ---------------------------------------------------------------------------
;; AI feedback for a specific section
;; ---------------------------------------------------------------------------

(hsx/defc section-ai-feedback
  [{:keys [section-name content]}]
  (let [[feedback set-feedback!] (hooks/use-state nil)
        [loading? set-loading?!] (hooks/use-state false)]
    [:div.writing-ai-feedback
     (shui/button
      {:size     :sm
       :variant  :ghost
       :class    "gap-1.5 text-xs w-full justify-start"
       :disabled loading?
       :on-click (fn []
                   (set-loading?! true)
                   (-> (ai/call-llm!
                        (str "You are an academic writing coach. Give specific, actionable feedback "
                             "on this '" section-name "' section of a research paper.\n\n"
                             "Focus on: clarity, argument strength, academic tone, completeness.\n"
                             "Be concise — 3-4 bullet points max.\n\n"
                             "Section content:\n" content))
                       (p/then (fn [r]
                                 (set-feedback! r)
                                 (set-loading?! false)))
                       (p/catch (fn [_]
                                  (set-feedback! "AI unavailable. Check settings.")
                                  (set-loading?! false)))))}
      (if loading?
        (shui/tabler-icon "loader-2" {:size 12 :class "animate-spin"})
        (shui/tabler-icon "sparkles" {:size 12}))
      (if loading? "Analysing…" "AI feedback on this section"))
     (when feedback
       [:div.writing-ai-result
        (for [[i line] (map-indexed vector (string/split feedback #"\n"))]
          (when (seq (string/trim line))
            [:p {:key i :class "text-xs leading-relaxed"} line]))])]))

;; ---------------------------------------------------------------------------
;; Export draft as linked Markdown page
;; ---------------------------------------------------------------------------

(defn- export-as-page!
  [title sections-content template-key]
  (let [template-name (get-in templates [template-key :name] "Draft")
        content (str "type:: [[Draft]]\ntemplate:: " template-name "\n\n"
                     (->> sections-content
                          (map (fn [[section text]]
                                 (str "## " section "\n\n"
                                      (if (seq (string/trim text))
                                        text
                                        "*[To be completed]*")
                                      "\n\n")))
                          (string/join ""))
                     "---\n*Created with Research IDE*\n")]
    (-> (page-handler/<create! title {:redirect? true :edit? false})
        (p/then (fn [_]
                  (notification/show! (str "Draft saved: [[" title "]]") :success)))
        (p/catch (fn [e]
                   (notification/show! (str "Save failed: " (.-message e)) :error))))))

;; ---------------------------------------------------------------------------
;; Template picker
;; ---------------------------------------------------------------------------

(hsx/defc template-picker
  [{:keys [on-select]}]
  [:div.writing-template-picker
   [:h1.writing-page-title "Writing"]
   [:p.writing-page-sub
    "Choose a template to start. Your draft saves as a linked page in the graph."]
   [:div.writing-template-grid
    (for [[k v] templates]
      [:button.writing-template-card
       {:key      (name k)
        :on-click #(on-select k)}
       [:div.writing-template-icon (:icon v)]
       [:div
        [:p.writing-template-name (:name v)]
        [:p.writing-template-sections
         (str (count (:sections v)) " sections")]]])]])

;; ---------------------------------------------------------------------------
;; Editor shell
;; ---------------------------------------------------------------------------

(hsx/defc editor-shell
  [{:keys [template-key]}]
  (let [template    (get templates template-key)
        sections    (:sections template)
        first-sec   (first sections)
        [active-sec set-active-sec!]   (hooks/use-state first-sec)
        [show-outline? set-outline?!]  (hooks/use-state true)
        [show-ai? set-ai?!]            (hooks/use-state false)
        [draft-title set-title!]       (hooks/use-state
                                         (str (:name template) " — "
                                              (.toLocaleDateString (js/Date.))))
        ;; section content map: section-name -> text
        [contents set-contents!]       (hooks/use-state {})
        [saving? set-saving?!]         (hooks/use-state false)

        get-content  (fn [s] (get contents s ""))
        set-content! (fn [s v] (set-contents! #(assoc % s v)))
        word-count   (fn [] (->> (vals contents)
                                  (string/join " ")
                                  (string/split _ #"\s+")
                                  (filter seq)
                                  count))]

    [:div.writing-editor
     ;; Top bar
     [:div.writing-topbar
      [:input.writing-title-input
       {:type        "text"
        :value       draft-title
        :on-change   #(set-title! (.. % -target -value))
        :placeholder "Draft title…"}]
      [:div.writing-topbar-actions
       [:span.writing-wordcount (str (word-count) " words")]
       (shui/button
        {:size     :sm
         :variant  :ghost
         :on-click #(set-outline?! (not show-outline?))}
        (shui/tabler-icon "list" {:size 14}))
       (shui/button
        {:size     :sm
         :variant  (if show-ai? :default :ghost)
         :class    "gap-1.5"
         :on-click #(set-ai?! (not show-ai?))}
        (shui/tabler-icon "sparkles" {:size 14})
        "AI")
       (shui/button
        {:size     :sm
         :class    "gap-1.5"
         :disabled saving?
         :on-click (fn []
                     (set-saving?! true)
                     (-> (export-as-page! draft-title contents template-key)
                         (p/finally #(set-saving?! false))))}
        (if saving?
          (shui/tabler-icon "loader-2" {:size 14 :class "animate-spin"})
          (shui/tabler-icon "device-floppy" {:size 14}))
        (if saving? "Saving…" "Save to graph"))]]

     [:div.writing-body
      ;; Outline sidebar
      (when show-outline?
        (section-outline {:template-key   template-key
                          :active-section active-sec
                          :on-select      set-active-sec!}))

      ;; Main editor area
      [:div.writing-main
       [:h2.writing-section-heading active-sec]
       [:textarea.writing-section-textarea
        {:key         active-sec
         :rows        18
         :placeholder (str "Write the " active-sec " section here…\n\n"
                           "Tip: Use [[page name]] to link to your papers and notes.")
         :value       (get-content active-sec)
         :on-change   #(set-content! active-sec (.. % -target -value))}]

       (when (seq (string/trim (get-content active-sec)))
         (section-ai-feedback {:section-name active-sec
                                :content      (get-content active-sec)}))]

      ;; AI assistant panel
      (when show-ai?
        [:div.writing-ai-panel
         (ai/ai-assistant-panel)])]]))

;; ---------------------------------------------------------------------------
;; Writing workspace entry point
;; ---------------------------------------------------------------------------

(hsx/defc writing-workspace
  []
  (let [[template set-template!] (hooks/use-state nil)]
    (if template
      (editor-shell {:template-key template})
      (template-picker {:on-select set-template!}))))
