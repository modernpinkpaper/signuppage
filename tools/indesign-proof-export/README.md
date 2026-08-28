# Auto-rotating InDesign proof export

Exports JPEG proofs from InDesign and automatically turns the ones that were
**laid out upside down** the right way up, so the proof you send out reads
normally.

Works on one open file, or on a whole folder of `.indd` files in one go.
Built and documented for **Windows**; the same scripts also run on a Mac.

## Why proofs come out upside down

On pieces like folded note cards, the artwork is placed upside down on the page
so that it prints and folds the right way. To work on it you turn on
**View → Rotate Spread → 180°**.

Rotate Spread View is *view only* — it deliberately does not affect print or
export. That is exactly why the JPEG comes out upside down: the artwork really
is upside down, and the rotate view was only correcting your screen.

The useful part: **InDesign saves that angle inside the .indd file itself.** It
is part of the document, not a setting on your computer, so it reads the same
on Windows as on a Mac. That makes your existing habit the flag — nothing extra
to label.

One condition: **save the file with the view still rotated.** If you turn the
view back to 0 before saving, the flag is gone.

("Spread" is just InDesign's word for what you see side by side in the window.
If your file is a single page, the page *is* the spread — rotate view covers
the whole thing and there is nothing else to think about.)

## Install (one time)

1. In InDesign: **Window → Utilities → Scripts**.
2. Right-click the **User** folder → **Reveal in Explorer**.
3. Copy both `.jsx` files into the `Scripts Panel` folder that opens.
4. They now show up in the Scripts panel. Double-click one to run it.

## Use

1. Make sure any upside-down file has **View → Rotate Spread → 180°** still
   turned on, and **save** it.
2. Double-click **Export Proofs (auto-rotate)** in the Scripts panel.
3. In the dialog, choose either the open document or a whole folder of `.indd`
   files, set the resolution (150 ppi is plenty for a proof), and click OK.

Proofs are saved to a `Proofs` folder next to the source files, named after the
file (`thank-you.jpg`). Multi-page files get `_1`, `_2` and so on. Tick
"Choose where the proofs are saved" if you want them somewhere else.

**Run "Check Spread Rotation" first**, once, on a file you know is upside down.
It reports the angle InDesign has saved. If it says `180`, everything works and
you never need to think about it again.

## Manual override

To force a rotation regardless of the view angle, give the spread a script
label named `proofRotation` set to `0`, `90`, `180`, or `270`. The override
wins.

This is also the fallback if **Check Spread Rotation** reports "not reported"
on your version of InDesign.

## Worth knowing

- **Nothing to install.** Windows rotates using PowerShell, which is already
  part of Windows. Macs use the built-in `sips`.
- **Your .indd files are never modified.** Batch mode opens each one, exports,
  and closes it without saving.
- **The flipped proofs get one extra round of JPEG compression** when they are
  rotated (re-saved at quality 92, with the original resolution preserved).
  Invisible at proof quality.
- **Rotation applies to the whole page.** If one page somehow contained both a
  right-way-up and an upside-down element, rotating the image would fix one and
  break the other. Not a concern for single-page card files.
- Requires InDesign CS6 or later.

## If something goes wrong

- *"did not report a Rotate Spread View angle"* — run **Check Spread
  Rotation**, and use the `proofRotation` label override above.
- *Proof is still upside down* — the file was almost certainly saved with the
  view rotated back to 0. Re-rotate the view, save, run again.
- *Rotation step fails or times out* — PowerShell is likely blocked by IT
  policy or security software. The proofs still export correctly, just
  unrotated.
