<?php

use StatamicAddon\BardStyle\Http\Controllers\StylesController;

Route::get('bard-style/size-vars', function () {
    try {
        $global    = \Statamic\Facades\GlobalSet::findByHandle('theme_settings');
        $variables = $global?->in('default');
        $data      = $variables?->data() ?? collect();
        $sizeVars  = $data->get('fluid_sizes')['sizes_css'] ?? [];
    } catch (\Throwable $e) {
        $sizeVars = [];
    }
    return response()->json($sizeVars);
})->middleware('can:access cp');

Route::get('bard-style/styles', [StylesController::class, 'index'])->middleware('can:access cp');
Route::put('bard-style/styles', [StylesController::class, 'update'])->middleware('can:access cp');
