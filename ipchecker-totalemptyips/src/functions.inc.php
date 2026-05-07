<?php
function getTotalEmptyIPs($items)
{
  $ips = explode(",", $items);
  $total_empty_ips = 0;
  for ($i = 0; $i < count($ips); $i++) {
    if ($ips[$i] == ""){
        $total_empty_ips += 1;
      }
  }
  return $total_empty_ips;
}

