"""Regression coverage for the project's actual Graphify import adapter."""
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools/agentkit'))
from import_boundaries import complete_import_boundaries


class ImportBoundariesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def graph(self, text, target='ref_react', relation='imports_from'):
        (self.root / 'main.tsx').write_text(text)
        return {
            'nodes': [{'id': 'main'}],
            'edges': [{'source': 'main', 'target': target, 'relation': relation,
                       'source_file': 'main.tsx', 'source_location': 'L1'}],
        }

    def test_external_import_is_an_evidenced_boundary_not_an_internal_symbol(self):
        graph = self.graph("import { useState } from 'react';\n")
        complete_import_boundaries(graph, self.root, {})
        node = graph['nodes'][-1]
        self.assertEqual(node['label'], 'react')
        self.assertEqual(node['reference_kind'], 'external')
        self.assertEqual(node['source_location'], 'main.tsx:1')
        self.assertEqual(graph['edges'][0]['target'], node['id'])

    def test_compiled_js_specifier_resolves_to_existing_tsx_anchor(self):
        graph = self.graph("import { App } from './App.js';\n", 'ref_app_js')
        (self.root / 'App.tsx').write_text('export function App() {}\n')
        graph['nodes'].append({'id': 'app_anchor'})
        complete_import_boundaries(graph, self.root, {'App.tsx': 'app_anchor'})
        self.assertEqual(graph['edges'][0]['target'], 'app_anchor')
        self.assertEqual(len(graph['nodes']), 2)

    def test_asset_is_distinguished_from_external_code(self):
        graph = self.graph("import './styles.css';\n", 'ref_styles_css')
        (self.root / 'styles.css').write_text('body {}')
        complete_import_boundaries(graph, self.root, {})
        self.assertEqual(graph['nodes'][-1]['reference_kind'], 'asset')

    def test_existing_unparsed_css_module_id_is_also_an_asset_boundary(self):
        graph = self.graph("import './styles.css';\n", 'src_client_styles')
        (self.root / 'styles.css').write_text('body {}')
        complete_import_boundaries(graph, self.root, {})
        self.assertEqual(graph['nodes'][-1]['reference_kind'], 'asset')

    def test_missing_relative_import_remains_a_blocking_failure(self):
        graph = self.graph("import { App } from './missing.js';\n", 'ref_missing_js')
        with self.assertRaisesRegex(RuntimeError, 'does not resolve'):
            complete_import_boundaries(graph, self.root, {})

    def test_unknown_call_is_not_disguised_as_an_external_import(self):
        graph = self.graph("import { useState } from 'react';\n", relation='calls')
        with self.assertRaisesRegex(RuntimeError, 'non-import'):
            complete_import_boundaries(graph, self.root, {})

    def test_relative_code_outside_indexed_roots_is_not_silently_accepted(self):
        graph = self.graph("import { App } from './App.js';\n", 'ref_app_js')
        (self.root / 'App.tsx').write_text('export function App() {}\n')
        with self.assertRaisesRegex(RuntimeError, 'outside configured code roots'):
            complete_import_boundaries(graph, self.root, {})

    def test_multiline_type_import_preserves_source_evidence(self):
        graph = self.graph("import type {\n  Socket\n} from 'socket.io-client';\n")
        complete_import_boundaries(graph, self.root, {})
        self.assertEqual(graph['nodes'][-1]['label'], 'socket.io-client')

    def test_duplicate_imports_share_one_external_boundary(self):
        graph = self.graph("import { useState } from 'react';\n")
        graph['edges'].append(dict(graph['edges'][0]))
        complete_import_boundaries(graph, self.root, {})
        self.assertEqual(len(graph['nodes']), 2)
        self.assertEqual(graph['edges'][0]['target'], graph['edges'][1]['target'])

    def test_symlink_import_is_not_used_to_bypass_the_corpus(self):
        graph = self.graph("import { App } from './linked.js';\n", 'ref_linked_js')
        (self.root / 'actual.ts').write_text('export function App() {}\n')
        (self.root / 'linked.js').symlink_to(self.root / 'actual.ts')
        with self.assertRaisesRegex(RuntimeError, 'symlink'):
            complete_import_boundaries(graph, self.root, {})

    def reexport_graph(self, export="export { Page } from './Page.js';\n"):
        graph = self.graph("import { Page } from './index.js';\n", 'index_page', 'imports')
        (self.root / 'index.ts').write_text(export)
        (self.root / 'Page.tsx').write_text('export function Page() {}\n')
        graph['nodes'].extend([
            {'id': 'index', 'label': 'index.ts', 'source_file': 'index.ts'},
            {'id': 'page', 'label': 'Page()', 'source_file': 'Page.tsx'},
            {'id': 'page_file'},
        ])
        graph['edges'].append({'source': 'index', 'target': 'ref_page_js', 'relation': 'imports_from',
                               'context': 're-export', 'source_file': 'index.ts', 'source_location': 'L1'})
        return graph, {'index.ts': 'index', 'Page.tsx': 'page_file'}

    def test_named_import_follows_an_explicit_reexport_to_the_real_definition(self):
        graph, anchors = self.reexport_graph()
        complete_import_boundaries(graph, self.root, anchors)
        self.assertEqual(graph['edges'][0]['target'], 'page')
        self.assertEqual(graph['edges'][0]['reexport_location'], 'index.ts:1')
        self.assertEqual(graph['edges'][1]['target'], 'page_file')

    def test_named_alias_retains_the_original_definition(self):
        graph, anchors = self.reexport_graph("export { Page as PublicPage } from './Page.js';\n")
        graph['edges'][0]['target'] = 'index_publicpage'
        (self.root / 'main.tsx').write_text("import { PublicPage } from './index.js';\n")
        complete_import_boundaries(graph, self.root, anchors)
        self.assertEqual(graph['edges'][0]['target'], 'page')

    def test_module_reexport_edge_resolves_compiled_js_to_tsx(self):
        graph, anchors = self.reexport_graph()
        graph['edges'][1]['relation'] = 're_exports'
        # The pinned library can also emit this alongside imports_from.
        graph['edges'].append({**graph['edges'][1], 'relation': 'imports_from'})
        complete_import_boundaries(graph, self.root, anchors)
        self.assertEqual(graph['edges'][1]['target'], 'page_file')

    def test_unknown_named_binding_is_not_fabricated_at_a_valid_module(self):
        graph, anchors = self.reexport_graph()
        graph['edges'][0]['target'] = 'index_missing'
        with self.assertRaisesRegex(RuntimeError, 'Unresolved named re-export'):
            complete_import_boundaries(graph, self.root, anchors)

    def test_unindexed_reexport_definition_remains_a_failure(self):
        graph, anchors = self.reexport_graph()
        del anchors['Page.tsx']
        with self.assertRaisesRegex(RuntimeError, 'outside configured code roots'):
            complete_import_boundaries(graph, self.root, anchors)

    def test_unextracted_reexport_definition_remains_a_failure(self):
        graph, anchors = self.reexport_graph()
        graph['nodes'] = [node for node in graph['nodes'] if node['id'] != 'page']
        with self.assertRaisesRegex(RuntimeError, 'unique extracted definition'):
            complete_import_boundaries(graph, self.root, anchors)

    def test_wildcard_reexports_do_not_guess_named_bindings(self):
        graph, anchors = self.reexport_graph("export * from './Page.js';\n")
        with self.assertRaisesRegex(RuntimeError, 'Unresolved named re-export'):
            complete_import_boundaries(graph, self.root, anchors)


if __name__ == '__main__':
    unittest.main()
