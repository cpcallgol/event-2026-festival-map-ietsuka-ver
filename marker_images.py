"""Display-only trimming for placed images. Source files are never modified."""

from functools import lru_cache
from io import BytesIO
from pathlib import Path

from flask import abort, send_file
from PIL import Image, ImageChops, ImageOps, UnidentifiedImageError

from storage import STATIC_IMAGE_DIR, ALLOWED_IMAGE_EXTENSIONS


def trim_image(image):
    image = ImageOps.exif_transpose(image).convert("RGBA")
    alpha = image.getchannel("A")
    visible = alpha.point(lambda value: 255 if value > 8 else 0)
    bounds = visible.getbbox()
    if not bounds:
        return image
    if alpha.getextrema()[0] >= 250:
        # Crop uniform outer backgrounds only. Different corner colours usually
        # indicate a photograph; keep that image intact.
        rgb = image.convert("RGB")
        corners = [rgb.getpixel(point) for point in (
            (0, 0), (rgb.width - 1, 0), (0, rgb.height - 1),
            (rgb.width - 1, rgb.height - 1),
        )]
        background = corners[0]
        if all(max(abs(a - b) for a, b in zip(background, colour)) <= 12 for colour in corners):
            difference = ImageChops.difference(rgb, Image.new("RGB", rgb.size, background))
            red, green, blue = difference.split()
            content = ImageChops.lighter(ImageChops.lighter(red, green), blue)
            detected = content.point(lambda value: 255 if value > 24 else 0).getbbox()
            if detected:
                bounds = detected
    left, top, right, bottom = bounds
    # Keep antialiased edges without reintroducing the original large margins.
    return image.crop((max(0, left - 1), max(0, top - 1),
                       min(image.width, right + 1), min(image.height, bottom + 1)))


@lru_cache(maxsize=48)
def _display_bytes(filename, modified_ns, size):
    with Image.open(filename) as source:
        output = BytesIO()
        trim_image(source).save(output, "PNG")
        return output.getvalue()


def register_image_routes(app):
    @app.get("/api/marker-image/<path:image_path>")
    def marker_image(image_path):
        root = STATIC_IMAGE_DIR.resolve()
        path = (root / image_path).resolve()
        if not path.is_relative_to(root) or path.suffix.lower() not in ALLOWED_IMAGE_EXTENSIONS:
            abort(404)
        try:
            stat = path.stat()
            data = _display_bytes(str(path), stat.st_mtime_ns, stat.st_size)
        except (OSError, UnidentifiedImageError, ValueError):
            abort(404)
        return send_file(BytesIO(data), mimetype="image/png", max_age=0)
