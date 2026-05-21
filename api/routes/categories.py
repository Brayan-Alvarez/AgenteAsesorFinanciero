"""
categories.py — CRUD endpoints for categories and subcategories.

GET    /api/categories
POST   /api/categories
PUT    /api/categories/{id}
DELETE /api/categories/{id}
POST   /api/categories/{id}/subcategories
PUT    /api/subcategories/{id}
DELETE /api/subcategories/{id}
"""

import logging
from fastapi import APIRouter, HTTPException
from api.models import CategoryCreate, CategoryOut, CategoryUpdate, SubcategoryCreate, SubcategoryUpdate
import db.queries as q

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/categories", response_model=list[CategoryOut])
async def list_categories():
    try:
        return q.get_categories()
    except Exception as exc:
        logger.exception("GET /api/categories failed.")
        raise HTTPException(500, "Could not load categories.") from exc


@router.post("/categories", response_model=CategoryOut, status_code=201)
async def create_category(body: CategoryCreate):
    try:
        return q.create_category(body.name, body.icon, body.color, body.type, body.sort_order)
    except Exception as exc:
        logger.exception("POST /api/categories failed.")
        raise HTTPException(500, "Could not create category.") from exc


@router.put("/categories/{category_id}", response_model=CategoryOut)
async def update_category(category_id: str, body: CategoryUpdate):
    try:
        fields = body.model_dump(exclude_none=True)
        if not fields:
            raise HTTPException(400, "No fields to update.")
        return q.update_category(category_id, **fields)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("PUT /api/categories/%s failed.", category_id)
        raise HTTPException(500, "Could not update category.") from exc


@router.delete("/categories/{category_id}", status_code=204)
async def delete_category(category_id: str):
    try:
        q.delete_category(category_id)
    except Exception as exc:
        logger.exception("DELETE /api/categories/%s failed.", category_id)
        raise HTTPException(500, "Could not delete category.") from exc


@router.post("/categories/{category_id}/subcategories", status_code=201)
async def create_subcategory(category_id: str, body: SubcategoryCreate):
    try:
        return q.create_subcategory(category_id, body.name, body.sort_order)
    except Exception as exc:
        logger.exception("POST /api/categories/%s/subcategories failed.", category_id)
        raise HTTPException(500, "Could not create subcategory.") from exc


@router.put("/subcategories/{subcategory_id}")
async def update_subcategory(subcategory_id: str, body: SubcategoryUpdate):
    try:
        fields = body.model_dump(exclude_none=True)
        return q.update_subcategory(subcategory_id, **fields)
    except Exception as exc:
        logger.exception("PUT /api/subcategories/%s failed.", subcategory_id)
        raise HTTPException(500, "Could not update subcategory.") from exc


@router.delete("/subcategories/{subcategory_id}", status_code=204)
async def delete_subcategory(subcategory_id: str):
    try:
        q.delete_subcategory(subcategory_id)
    except Exception as exc:
        logger.exception("DELETE /api/subcategories/%s failed.", subcategory_id)
        raise HTTPException(500, "Could not delete subcategory.") from exc
