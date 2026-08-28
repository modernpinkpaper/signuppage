# Auto-rotating InDesign proof export

Exports JPEG proofs from an InDesign document and automatically turns any page
that was **laid out upside down** the right way up, so the proof you send out
reads normally.

## Why proofs come out upside down

On pieces like folded note cards, part of the artwork is placed upside down on
the page so that it prints and folds the right way. To work on it you turn on
**View → Rotate Spread → 180°**.

Rotate Spread View is deliberately *view only* — it does not affect print or
export. That is exactly why the JPEG comes out upside down: the artwork really
is upside down, and the rotate view was only correcting your screen.

The useful part: **InDesign saves that view angle inside the document**, and
scripting can read it. So it already works as a flag. Nothing extra to label —
as long as you save the `.indd` with the view still rotated.

## Install (one time)

1. In InDesign: **Window → Utilities → Scripts**.
2. Right-click the **User** folder → **Reveal in Finder**.
3. Drop both `.jsx` files into the `Scripts Panel` folder that opens.
4. They now appear in the Scripts panel. Double-click to run.

## Use

1. Open the document.
2. Make sure any upside-down spread still has **View → Rotate Spread → 180°**
   turned on, and **save**.
3. Double-click **Export Proofs (auto-rotate)** in the Scripts panel.
4. Choose resolution (150 ppi is plenty for a proof) and click OK.

Proofs land in a `Proofs` folder next to the `.indd`, named
`DocumentName_1.jpg`, `DocumentName_2.jpg`, and so on. Tick the folder option
in the dialog if you want them somewhere else.

To confirm InDesign is reporting the angle on your setup, run
**Check Spread Rotation** on a file you know is upside down. A spread saved at
180° should report `180`.

## Manual override

If you ever need to force a specific rotation regardless of the view angle,
give the spread a script label named `proofRotation` with a value of `0`, `90`,
`180`, or `270`. The override wins.

This is also the fallback if **Check Spread Rotation** reports "not reported"
on your InDesign version.

## Worth knowing

- **Save with the view still rotated.** Rotate the view back to 0 before
  saving and the flag is gone, so the script has nothing to go on.
- **Rotation is per spread, not per object.** If one spread contains both a
  right-way-up panel and an upside-down panel, rotating the whole exported
  image fixes one and breaks the other. Those need splitting across spreads,
  or a manual fix.
- **The JPEG is re-encoded when it gets rotated**, so it takes one extra round
  of JPEG compression. Invisible at proof quality; if it ever bothers you, the
  fix is to export PNG instead.
- **Nothing to install.** macOS rotates with the built-in `sips`; Windows uses
  PowerShell. The source document is never modified.
- Requires InDesign CS6 or later.
