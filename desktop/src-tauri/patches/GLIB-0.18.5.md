# Local GLib 0.18.5 security backport

Tauri 2's Linux GTK3 dependency graph requires GLib 0.18, while the upstream
fixed release is 0.20.0. There is no patched 0.18.x release to select through
Cargo, so Carta vendors the crates.io `glib` 0.18.5 source and applies the
upstream fix from gtk-rs-core PR 1343 (commit `b5a4071`).

The sole code change is in `vendor/glib-0.18.5/src/variant_iter.rs`:
`VariantStrIter::impl_get` now passes its C out-pointer as `&mut p` rather than
`&p`. The original crate license and copyright notices are retained. Cargo's
`[patch.crates-io]` entry ensures every transitive `glib` 0.18 dependency uses
this source.

Remove this local override after the Tauri Linux stack upgrades to an upstream
GLib version that includes the fix. Verify the resolved dependency with
`cargo tree --manifest-path desktop/src-tauri/Cargo.toml --target x86_64-unknown-linux-gnu -i glib`.
