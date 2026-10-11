# X3D coverage

X3Diff reads XML-encoded X3D 3.0, 3.1, 3.2, 3.3 and 4.0 using an explicit catalog generated from the [Web3D X3DUOM 3.3 model](https://www.web3d.org/specifications/X3dUnifiedObjectModel-3.3.xml) and [X3D 3.3 XML schema](https://www.web3d.org/specifications/x3d-3.3.xsd). The light fields that X3D 4.0 added and the defaults it changed come from the [X3DUOM 4.0 model](https://www.web3d.org/specifications/X3dUnifiedObjectModel-4.0.xml). Source hashes are recorded in the catalog; the 3.3 hashes are also in the exported report. Other declared versions are not compared.

## Semantic coverage

The catalog contains 50 node types. Lights (DirectionalLight, PointLight, SpotLight), viewpoints (Viewpoint, OrthoViewpoint), NavigationInfo, Background and WorldInfo are among them. Its authoritative field definitions are in [src/x3d/catalog.ts](../src/x3d/catalog.ts). Each exported report includes the exact supported node and field types, and the published site lists the node types on its `coverage.html` page, which the workbench links from the File differences heading.

Supported declarations include typed attributes and defaults, DEF/USE, ROUTE, document context and metadata. Versions other than 3.3 carry a note that they are read with the 3.3 catalog. The X3D 4.0 default placement of metadata within a MetadataSet is applied, the 4.0 light fields `shadows` and `shadowIntensity` are compared, and SpotLight.beamWidth takes the default of the declared version. Fields outside the catalog produce diagnostics.

Unknown nodes are opaque as a whole. Their descendants do not enter the scene's DEF scope or contribute typed differences. This includes prototype bodies, scripts and unsupported containers. External content is declared but is not fetched for semantic comparison.

| Result                        | Interpretation                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Complete                      | Declarations within the supported comparison model were read without a coverage error.                        |
| Complete with warnings        | Comparison completed with notes, such as external content declared but not evaluated.                         |
| Incomplete                    | Partial differences are available; diagnostics identify unsupported or invalid content and uncertain matches. |
| Failed or unsupported version | No semantic differences are presented as a valid comparison.                                                  |

A no-change result establishes only that no differences were found within the declared model and tolerances. Rendering a scene does not establish semantic coverage. A changed light is reported as a declaration; the illumination it produces is not measured. Runtime evaluation, prototypes, arbitrary scripts, external scenes and full standard conformance remain outside the model.

## Geometry and motion

Static geometry inspection supports direct Box, Sphere, closed Cylinder and bounded convex IndexedFaceSet geometry under supported Group/Transform placement. Surface distances sample triangle centres. Volume analysis uses tessellated primitives or a bounded occupancy grid for supported meshes. Measurements use scene coordinates without registration or unit conversion.

Motion follows enabled TimeSensor declarations through PositionInterpolator or OrientationInterpolator ROUTEs to named Transforms, including animated parents under Group/Transform placement. A centre or bounds corner is tracked over 240 intervals, using the longest contributing clock interval for each revision. Start/stop/pause/resume times and runtime triggers are not evaluated. Sampling may miss motion between samples and does not cover every combined period when multiple clocks contribute. Unsupported geometry uses a unit tracking reference; more than 128 animated objects skips motion with a visible notice.

## Verification

Unit fixtures exercise typed parsing, version boundaries, opaque content, invalid input, geometry and motion. Browser tests exercise previews and review controls with bundled scenes and targeted fixtures. Production tests exercise the built project path, resources and exports. See the [report format](REPORT_SCHEMA.md) and the [user guide](USER_GUIDE.md).

These checks verify the specified cases. They do not assert coverage percentages for all Web3D archives or equivalence between arbitrary runtime scenes.
