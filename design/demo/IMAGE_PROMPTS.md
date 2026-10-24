# Demo image prompt

The live `/demo` uses four generated 2×2 contact sheets in `frontend/public/demo/img/`: one independently framed living-room photo per fictional home. CSS crops each quadrant, so 16 distinct Style/Browse photos cost only four generations and 1.3 MB of WebP assets. The 64-photo prompt below is an optional future gallery expansion, not a requirement for the current demo. All listings, agencies and prices in `manifest.json` are invented; the demo never accesses production listings or shared-list data.

Paste the block below into an image-capable AI (ChatGPT, Gemini, etc.). Put the 64 results in `frontend/public/demo/img/`. Catalogue data lives in `manifest.json` (names, prices and agencies are fictional).

```
Create 64 photorealistic interior photos for a fictional London rental app demo: 16 homes (H01-H16), 4 photos each, in this order: living room, bedroom, kitchen, bathroom.

Look of EVERY photo: a real estate-agent listing photo of a London flat. 3:2 landscape, 1536x1024, wide-angle (about 24mm), camera at chest height, straight vertical lines, natural daylight with the lights on, true colours, sharp, lightly edited. Furnished, tidy, lived-in but empty of people. No text, logos, watermarks, signs, pets, or visible brand names. Everything in one home must look like the SAME flat: same walls, floors, palette and furniture across its 4 photos. Keep homes clearly different from each other in style.

Save each as JPG, quality about 80, named exactly: h01-living.jpg, h01-bedroom.jpg, h01-kitchen.jpg, h01-bathroom.jpg, then h02-..., up to h16-bathroom.jpg.

Homes (style: what it looks like):
H01 Scandinavian: bright airy flat: whitewashed walls, light oak floor, linen sofa, pale wood furniture, a few green plants, big sash windows, soft morning light
H02 Scandinavian: bright Scandinavian flat: white walls, pale ash floor, grey-blue accents, sheepskin throws, tulips, a small balcony visible through glass doors
H03 Industrial: converted-factory loft: exposed red brick, black steel-framed windows, polished concrete floor, iron pipes, leather sofa, filament bulbs
H04 Industrial: warehouse conversion: very tall black steel windows, exposed brick and concrete beams, dark timber floor, metal shelving, big pendant lamps
H05 Victorian period: Victorian period flat: tall sash windows, ornate cornicing and ceiling rose, original fireplace, sanded floorboards, painted skirting, muted heritage colours
H06 Victorian period: Victorian conversion with a curved bay window, picture rails, tall ceilings, a marble fireplace, a vintage rug, warm lamplight
H07 Modern new-build: new-build tower apartment: floor-to-ceiling glazing, neutral grey and white palette, engineered oak floor, sleek handleless kitchen, city view
H08 Modern new-build: contemporary new-build: open-plan living, glossy white kitchen with quartz island, recessed spotlights, light grey carpet and oak, large windows
H09 Cosy boho: cosy bohemian flat: rattan furniture, many trailing plants, layered textiles and macramé, warm terracotta and mustard tones, string lights
H10 Cosy eclectic: cosy cottage-style flat: patterned wallpaper, mismatched vintage furniture, bookshelves, warm lamps, a wood-burner, quilts and cushions
H11 Japandi minimalist: Japandi minimalist flat: pale wood, low furniture, neutral stone and oatmeal tones, paper lantern, almost no clutter, calm diffuse light
H12 All-white minimalist: all-white minimalist mews house: white walls and floors, very few objects, clean lines, a single sculptural chair, bright even light
H13 Dark and moody: dark moody flat: deep navy walls, brass fittings, velvet sofa, dark wood, low warm lighting, framed art
H14 Dark and moody: dark moody flat: forest-green panelled walls, black woodwork, rich leather, candles, dramatic contrast, warm lamplight
H15 Colourful eclectic: colourful eclectic flat: bold coral and teal walls, patterned tiles, mixed prints, big framed art, lots of plants, playful furniture
H16 Colourful maximalist: colourful maximalist studio: pink and turquoise walls, velvet furniture, gold accents, gallery wall, patterned rug, a statement lamp

Make the kitchen and bathroom match each home's style (materials, colours, fittings). Do them one at a time and show each so I can reject any that look wrong.
```
