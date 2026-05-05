# Mauth Studio Penrose Cheat Sheet

Basic Substance syntax for static geometry diagrams in Mauth Studio.

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
```

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
Label onlyA $A \setminus B$
Label intersection $A \cap B$
Label onlyB $B \setminus A$
Label outside $(A \cup B)'$

Venn(U, A, B)
LabelsLeftOnly(onlyA, A, B)
LabelsIntersection(intersection, A, B)
LabelsRightOnly(onlyB, A, B)
LabelsOutside(outside, U, A, B)
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
Point O, A
Circle gamma
Line tangentA

Label O $O$
Label A $A$
Label gamma $\Gamma$

CircleThrough(gamma, O, A)
Tangent(tangentA, gamma, A)
Segment(OA, O, A)
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
