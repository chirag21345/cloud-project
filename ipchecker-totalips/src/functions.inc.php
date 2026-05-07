<?php
function getTotalIPs($items)
{
  $ips = explode(",", $items);
  $total_ips = sizeof($ips);
  return $total_ips;
}
