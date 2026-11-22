# vendor/libredwg — el satélite DWG

`bin/dwg2dxf` es el conversor de [GNU LibreDWG](https://www.gnu.org/software/libredwg/)
(GPL-3.0-or-later, como IngeTrazo), compilado como ejecutable de línea de
comandos para x86_64 Linux, enlazado solo contra libc/libm — corre en
cualquier distro razonable. Portado del build de IngeCAD (2026-08-31), que
lleva los dos remiendos documentados en `formats/dwg_bridge.py` (handles 0 y
duplicados — LibreDWG issue #1356).

El código fuente está en el upstream de LibreDWG (https://github.com/LibreDWG/libredwg).
Para reconstruirlo: `./configure --disable-shared --disable-bindings && make`
y tomar `programs/dwg2dxf`.

`dxf2dwg` (export a DWG) no se incluye: la app aún no lo usa.

## Por plataforma (#101, 2026-09-28)

| Paquete | De dónde sale `dwg2dxf` |
|---|---|
| AppImage, .tar.gz, Snap | este `bin/dwg2dxf` (0.14.8580, en git) |
| Flatpak | el mismo `bin/dwg2dxf`, instalado por la receta (corre sobre el runtime 25.08, glibc 2.42) |
| Windows | `dwg2dxf.exe` + `libredwg-0.dll` + `libiconv-2.dll` del zip OFICIAL `libredwg-0.14.8597-win64.zip` de las releases de LibreDWG; `build-windows.yml` lo descarga y verifica su sha256 (`7fee5c67…ddfa2`) |
| macOS | compilado por `release-macos.yml` desde `libredwg-0.14.8597.tar.xz` (sha256 de su `dist.sha256`), `--disable-shared` |

Fuente de las releases: https://github.com/LibreDWG/libredwg/releases/tag/0.14.8597.
Comprobado: el DWG de la plaza de Yanque da el mismo DXF con el binario de
Linux y con el de Windows (10 084 entidades, 65 capas).
