/*
 * insert_citation_picker.ts
 *
 * Copyright (C) 2020 by RStudio, PBC
 *
 * Unless you have received this program directly from RStudio pursuant
 * to the terms of a commercial license agreement with RStudio, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */


import React from "react";

import { Node as ProsemirrorNode } from 'prosemirror-model';

import { EditorUI } from "../../api/ui";
import { EditorServer } from "../../api/server";
import { WidgetProps } from "../../api/widgets/react";
import { TagInput, TagItem } from "../../api/widgets/tag-input";
import { NavigationTreeNode, containsChild, NavigationTree } from "../../api/widgets/navigation-tree";
import { DialogButtons } from "../../api/widgets/dialog-buttons";
import { BibliographyManager, BibliographyFile, BibliographySource } from "../../api/bibliography/bibliography";
import { kLocalBiliographyProviderKey } from "../../api/bibliography/bibliography-provider_local";

import { bibliographySourcePanel } from "./source_panels/insert_citation-source-panel-bibliography";
import { doiSourcePanel } from "./source_panels/insert_citation-source-panel-doi";
import { crossrefSourcePanel } from "./source_panels/insert_citation-source-panel-crossref";

import { CitationBibliographyPicker } from "./insert_citation-bibliography-picker";

import './insert_citation-panel.css';

// Citation Panels are the coreUI element of ths dialog. Each panel provides
// the main panel UI as well as the tree to display when the panel is displayed.
export interface CitationSourcePanel {
  key: string;
  panel: React.FC<CitationSourcePanelProps>;
  treeNode(): NavigationTreeNode;
}

export interface CitationListEntry {
  id: string;
  authors: (width: number) => string;
  date: string;
  journal: string | undefined;
  title: string;
  providerKey: string;
  image?: string;
  imageAdornment?: string;
  toBibliographySource: () => Promise<BibliographySource>;
}

// Panels get a variety of information as properties to permit them to search
// citations and add them
export interface CitationSourcePanelProps extends WidgetProps {
  ui: EditorUI;
  bibliographyManager: BibliographyManager;
  server: EditorServer;
  height: number;
  selectedNode?: NavigationTreeNode;
  citationsToAdd: CitationListEntry[];
  addCitation: (citation: CitationListEntry) => void;
  removeCitation: (citation: CitationListEntry) => void;
  selectedCitation: (citation?: CitationListEntry) => void;
  confirm: VoidFunction;
  ref: React.Ref<any>;
}

// The picker is a full featured UI for finding and selecting citation data
// to be added to a document.
interface InsertCitationPanelProps extends WidgetProps {
  ui: EditorUI;
  doc: ProsemirrorNode;
  height: number;
  width: number;
  bibliographyManager: BibliographyManager;
  server: EditorServer;
  onCitationsChanged: (sources: CitationListEntry[]) => void;
  onBibliographyChanged: (bibliographyFile: BibliographyFile) => void;
  onSelectedNodeChanged: (node: NavigationTreeNode) => void;
  selectedNode?: NavigationTreeNode;
  onOk: () => void;
  onCancel: () => void;
}

export const InsertCitationPanel: React.FC<InsertCitationPanelProps> = props => {

  // The panels that are being displayed and which one is selected
  const providerPanels = React.useMemo<CitationSourcePanel[]>(() => [
    bibliographySourcePanel(props.doc, props.ui, props.bibliographyManager, () => {
      // Load the tree and select the root node
      const treeNodes = providerPanels.map(panel => panel.treeNode());
      setTreeSourceData(treeNodes);
    }),
    doiSourcePanel(props.ui),
    crossrefSourcePanel(props.ui),
  ], []);

  // The default tree nodes
  const defaultTreeNodes = React.useMemo<NavigationTreeNode[]>(() => {
    return providerPanels.map(panel => panel.treeNode());
  }, [providerPanels]);

  // The default selected node
  const defaultNode = React.useMemo<NavigationTreeNode>(() => {
    return props.selectedNode || defaultTreeNodes[0];
  }, [props.selectedNode]);

  // Find the panel associated with the selected tree node
  const panelForNode = (node: NavigationTreeNode, sourcePanels: CitationSourcePanel[]) => {
    const panelItem = sourcePanels.find(panel => {
      const panelTreeNode = panel.treeNode();
      return containsChild(node.key, panelTreeNode);
    });
    return panelItem;
  };

  // The selected panel
  const [selectedProviderPanel, setSelectedProviderPanel] = React.useState<CitationSourcePanel>(panelForNode(defaultNode, providerPanels) || providerPanels[0]);

  // The node of the tree that is selected
  const [selectedNode, setSelectedNode] = React.useState<NavigationTreeNode>(defaultNode);

  // Data for the Navigation Tree
  const [treeSourceData, setTreeSourceData] = React.useState<NavigationTreeNode[]>(defaultTreeNodes);

  // The accumulated bibliography sources to be inserted
  // We need to track these specially to deal with merging the explicitly added items
  // with the currently selected item
  const [citationsToAdd, setCitationsToAdd] = React.useState<CitationListEntry[]>([]);
  const [selectedCitation, setSelectedCitation] = React.useState<CitationListEntry>();

  // Used to track whether initial focus has been set
  const [initialFocus, setInitialFocus] = React.useState<boolean>(true);

  // The loadded panel reference (used for focus, etc...)
  const panelRef = React.useRef<any>(undefined);

  // The initial loading of data for the panel. 
  React.useEffect(() => {
    async function loadData() {
      await props.bibliographyManager.load(props.ui, props.doc);

      if (props.selectedNode) {
        setSelectedNode(props.selectedNode);
      } else {
        setSelectedNode(treeSourceData[0]);
      }
    }
    loadData();
  }, []);

  const mergeCitations = (toAdd: CitationListEntry[], selected?: CitationListEntry) => {
    if (!selected) {
      return toAdd;
    } else {
      if (toAdd.map(citation => citation.id).includes(selected.id)) {
        return toAdd;
      } else {
        return (toAdd || []).concat(selected);
      }
    }
  };

  // As citations to add or selection changes, notify of updated citationsToAdd
  React.useEffect(() => {
    props.onCitationsChanged(mergeCitations(citationsToAdd, selectedCitation));
  }, [selectedCitation, citationsToAdd]);

  // Whenever the user selects a new node, lookup the correct panel for that node and 
  // select that panel.
  React.useEffect(() => {
    if (selectedNode) {
      const rootPanel = panelForNode(selectedNode, providerPanels);
      if (rootPanel && rootPanel?.key !== selectedProviderPanel?.key) {
        setSelectedProviderPanel(rootPanel);
      }
    }
  }, [selectedNode]);

  // If we should set initial focus, go ahead and set it 
  React.useEffect(() => {
    if (panelRef.current && initialFocus) {
      setTimeout(() => {
        panelRef.current.focus();
      }, 200);
      setInitialFocus(false);
    }
  }, []);

  // Style properties
  const style: React.CSSProperties = {
    width: props.width + 'px',
    ...props.style,
  };

  // Figure out the panel height (the height of the main panel less padding and other elements)
  const panelHeight = props.height * .75;

  // Load the panel that is displayed for the selected node
  const citationProps: CitationSourcePanelProps = {
    ui: props.ui,
    bibliographyManager: props.bibliographyManager,
    server: props.server,
    height: panelHeight,
    selectedNode,
    citationsToAdd,
    addCitation: (citation: CitationListEntry) => {
      const newCitations = [...citationsToAdd, citation];
      setCitationsToAdd(newCitations);
    },
    removeCitation: (citation: CitationListEntry) => {
      deleteCitation(citation.id);
    },
    selectedCitation: (citation?: CitationListEntry) => {
      setSelectedCitation(citation);
    },
    confirm: props.onOk,
    ref: panelRef
  };

  // Create the panel that should be displayed for the selected node of the tree
  const panelToDisplay = selectedProviderPanel ? React.createElement(selectedProviderPanel.panel, citationProps) : undefined;

  const nodeSelected = (node: NavigationTreeNode) => {
    setSelectedNode(node);
    props.onSelectedNodeChanged(node);
  };

  const deleteCitation = (id: string) => {
    const filteredCitations = citationsToAdd.filter(source => source.id !== id);
    setCitationsToAdd(filteredCitations);
    props.onCitationsChanged(citationsToAdd);
  };

  const deleteTag = (tag: TagItem) => {
    deleteCitation(tag.key);
  };

  const tagEdited = (key: string, text: string) => {
    const targetSource = citationsToAdd.find(source => source.id === key);
    if (targetSource) {
      targetSource.id = text;
    }
  };

  const bibliographyFileChanged = (biblographyFile: BibliographyFile) => {
    props.onBibliographyChanged(biblographyFile);
  };

  // Support keyboard shortcuts for dismissing dialog
  const onKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      props.onOk();
    }
  };

  // Esc can cause loss of focus so catch it early
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      props.onCancel();
    }
  };

  const citationList = (selectedCitation && !citationsToAdd.includes(selectedCitation) ? [...citationsToAdd, selectedCitation] : citationsToAdd);

  return (
    <div className='pm-cite-panel-container' style={style} onKeyPress={onKeyPress} onKeyDown={onKeyDown}>

      <div className='pm-cite-panel-cite-selection'>
        <div className='pm-cite-panel-cite-selection-sources pm-block-border-color pm-background-color'>
          <NavigationTree
            height={panelHeight}
            nodes={treeSourceData}
            selectedNode={selectedNode}
            nodeSelected={nodeSelected}
          />
        </div>
        <div className='pm-cite-panel-cite-selection-items'>
          {panelToDisplay}
        </div>
      </div>
      <div
        className='pm-cite-panel-selected-cites pm-block-border-color pm-background-color'
      >
        <TagInput
          tags={citationList.map(source => ({
            key: source.id,
            displayText: source.id,
            displayPrefix: '@',
            isEditable: source.providerKey !== kLocalBiliographyProviderKey,
          }))}
          tagDeleted={deleteTag}
          tagChanged={tagEdited}
          ui={props.ui}
          placeholder={props.ui.context.translateText('Selected Citation Keys')} />
      </div>
      <div className='pm-cite-panel-select-bibliography'>
        <CitationBibliographyPicker
          bibliographyFiles={props.bibliographyManager.writableBibliographyFiles(props.doc, props.ui)}
          biblographyFileChanged={bibliographyFileChanged}
          ui={props.ui} />

        <DialogButtons
          okLabel={props.ui.context.translateText('Insert')}
          cancelLabel={props.ui.context.translateText('Cancel')}
          onOk={props.onOk}
          onCancel={props.onCancel} />
      </div>
    </div>
  );
};

