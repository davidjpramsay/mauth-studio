# Mauth Studio Penrose Cheat Sheet

Basic Substance syntax for static geometry diagrams in Mauth Studio.

The assistant-facing path for `geometricConstruction` should normally use this supported Penrose Substance dialect directly in `graphConfig.options.substanceSource`. Structured `graphConfig.data` geometry can exist for simple UI controls, but it should not become a second Penrose language.

## What You Usually Edit

For normal use, edit only **Substance**. Mauth supplies the Penrose Domain and Style preset.

```penrose
Point A, B, C
Label angleTheta $\theta$
Label a $a$

Triangle(A, B, C)
Segment(AB, A, B)
Segment(AC, A, C)
EqualLength(AB, AC)
LabelsAngle(angleTheta, B, A, C)
LabelsSegment(a, AB)
LabelsSegment(a, AC)
HidePoints(A, B, C)
```

## Core Declarations

```penrose
Point A, B, C
Line l
Ray r
Circle gamma
NamedSegment AB, AC
```

Declare objects first, then describe relationships.

## Labels

```penrose
Label A $A$
Label gamma $\Gamma$
Label angleTheta $\theta$
Label sideAB $5\text{ cm}$
```

Point labels are optional. If a point has no `Label`, Mauth adds an invisible label so Penrose can still render the diagram.

## Hide Point Dots

Point dots are shown by default.

```penrose
HidePoint(A)
HidePoints(A, B, C)
```

Use this for clean construction diagrams where vertices should not show black dots.

## Triangles And Segments

```penrose
Triangle(A, B, C)
Segment(AB, A, B)
Segment(BC, B, C)
Segment(AC, A, C)
```

`Triangle(A, B, C)` draws the triangle. Named segments are useful when you want side labels, equal-side marks, or readable AI-authored diagrams.

Mauth does not automatically create reusable segment names from `Triangle(A, B, C)`. Add `Segment(AB, A, B)` when that side needs a label, tick mark, or relationship.

## Side Labels

```penrose
Label a $a$
LabelsSegment(a, AB)
LabelsSegment(a, AC)
```

You can reuse the same displayed label in multiple places. Mauth creates internal copies for Penrose, so both sides can show `$a$`.

You can also label by endpoints:

```penrose
Label sideAB $12\text{ cm}$
LabelsSegment(sideAB, A, B)
```

## Equal Length Marks

Preferred readable form:

```penrose
Segment(AB, A, B)
Segment(AC, A, C)
EqualLength(AB, AC)
```

Two or three side ticks:

```penrose
EqualLength2(AB, AC)
EqualLength3(AB, AC)
```

Older point-pair form:

```penrose
EqualLength(A, B, A, C)
```

Prefer named segments for new diagrams.

## Angles

Angle order is `start, vertex, end`.

```penrose
Label theta $\theta$
LabelsAngle(theta, B, A, C)
```

Angle marks:

```penrose
AngleMark(B, A, C)
AngleMark2(B, A, C)
AngleMark3(B, A, C)
```

Right angles:

```penrose
RightAngle(B, A, C)
```

## Lines, Rays, And Construction Lines

```penrose
Line l
LineThrough(l, A, B)

Ray r
RayFrom(r, A, B)

Perpendicular(l, m)
Parallel(l, m)
ParallelToSegment(l, A, B)
PerpendicularToSegment(l, A, B)
```

Use `ParallelToSegment(l, A, B)` when the visible object should be only the segment `AB`, such as a chord parallel to a tangent. Use `Parallel(l, m)` when both full construction lines should be visible.
Use `PerpendicularToSegment(l, A, B)` for a line perpendicular to a drawn segment `AB`.

## Circles

```penrose
Circle gamma
Label gamma $\Gamma$

CircleWithCenter(gamma, O)
CircleThrough(gamma, O, A)
OnCircle(B, gamma)
```

`CircleThrough(gamma, O, A)` means centre `O`, through point `A`.

## Tangents And Secants

```penrose
Line tangentA
Tangent(tangentA, gamma, A)
ParallelToSegment(tangentA, B, C)

Line secantBC
Secant(secantBC, gamma, B, C)
```

For tangents, the point should lie on the circle.

## Midpoints And Bisectors

```penrose
Midpoint(M, A, B)

Line angleBisector
AngleBisector(angleBisector, A, B, C)

Line perpBisector
PerpendicularBisector(perpBisector, A, B)
```

For `AngleBisector(angleBisector, A, B, C)`, the angle is at `B`.

## Set Diagrams

Set diagrams use the `sets` preset.

```penrose
Universe U
Set A, B
RegionLabel onlyA, intersection, onlyB, outside

Label U $U$
Label A $A$
Label B $B$
Label onlyA $A \cap B'$
Label intersection $A \cap B$
Label onlyB $A' \cap B$
Label outside $(A \cup B)'$

Venn(U, A, B)
LabelsLeftOnly(onlyA, A, B)
LabelsIntersection(intersection, A, B)
LabelsRightOnly(onlyB, A, B)
LabelsOutside(outside, U, A, B)
```

Optional shaded-region predicates for two-set Venn diagrams:

```penrose
ShadeLeftOnly(A, B)
ShadeIntersection(A, B)
ShadeRightOnly(A, B)
ShadeOutside(U, A, B)
```

Venn labels should stay as plain dark text, including over shaded regions. Avoid adding white halos or label boxes unless the task explicitly calls for a boxed count badge.

Use count badges only when the problem asks for totals or placeholders. Preferred style: a small square badge attached to the top-right corner of the universal rectangle for `n(U)`/total/occasionally `U`, and small arc-only semicircle side tabs attached to the outside edge of the relevant set circle for set totals such as `n(A)` and `n(B)`. Side tabs should not have a straight chord line, and the count should sit inside the semicircle tab rather than outside the diagram or on a region boundary. Put set labels such as `A` and `B` just outside the top of the circles. When side-tab totals are present, align the A-total, A-only, intersection, B-only, and B-total values on one horizontal centreline and space the three inner values evenly between the side-tab totals. Put the outside value near the lower-right of the universal rectangle unless the teacher explicitly wants another placement. Venn label text is held at document-size maths text and compensated against diagram scale and the default 80% display scale.

For two-set Venn diagrams, `scalePercent=100` is the normal size and displays the 420 by 300 SVG canvas at 80% by default.

Use `VectorSegment(name, start, end)` for directed links in schematic network diagrams. Use `Segment(name, start, end)` for undirected links. Coordinate-accurate vectors such as $\mathbf{a}=\begin{pmatrix}2\\3\end{pmatrix}$ should use the JSXGraph `vector2d` diagram type instead of Penrose.

```penrose
Point A, B, C
NamedSegment AB, AC, BC
LengthLabel abLabel

Label A $A$
Label B $B$
Label C $C$
Label abLabel $p$

VectorSegment(AB, A, B)
VectorSegment(AC, A, C)
Segment(BC, B, C)
LabelsSegment(abLabel, A, B)
```

## Common Patterns

### Isosceles Triangle With Angle

```penrose
Point A, B, C
Label theta $\theta$
Label a $a$

Triangle(A, B, C)
Segment(AB, A, B)
Segment(AC, A, C)
EqualLength(AB, AC)
AngleMark(B, A, C)
LabelsAngle(theta, B, A, C)
LabelsSegment(a, AB)
LabelsSegment(a, AC)
HidePoints(A, B, C)
```

### Circle With Tangent

```penrose
Point centre, A
Circle gamma
Line tangentA

Label centre $\,$
Label A $A$
Label gamma $\Gamma$

HidePoint(centre)
CircleThrough(gamma, centre, A)
Tangent(tangentA, gamma, A)
```

### Right Triangle

```penrose
Point A, B, C
Label sideAB $5\text{ cm}$
Label sideBC $12\text{ cm}$

Triangle(A, B, C)
RightAngle(A, B, C)
Segment(AB, A, B)
Segment(BC, B, C)
LabelsSegment(sideAB, AB)
LabelsSegment(sideBC, BC)
```

## Practical Rules

- Use one object name per thing: `A`, `B`, `AB`, `gamma`, `theta`.
- Use named segments when a side is important.
- Reuse label names when the same displayed label should appear on multiple sides.
- Use `HidePoints(...)` when you want clean exam-style vertices.
- Use `Resample` in the editor when Penrose gives an awkward but valid layout.
- If a diagram is too specific, add more relationships rather than manual positioning.

## If It Does Not Render

- Check every object is declared before it is used.
- Check names are simple identifiers: `A`, `B`, `AB`, `gamma`, `theta1`.
- Check angle order is `start, vertex, end`.
- Check tangent points are constrained to the circle.
- Prefer named segments if side labels or equal-length marks behave strangely.
- Remove one relationship at a time to find the line Penrose cannot satisfy.
