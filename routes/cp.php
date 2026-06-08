<?php

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
